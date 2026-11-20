"""Reproducible CPU/GPU training with validation and exact checkpoint resume."""
from __future__ import annotations
import hashlib, random
from pathlib import Path
import numpy as np
import torch
from torch.optim import AdamW
from .tokenizer import ByteBPETokenizer
from .transformer import GPTConfig, QuantumGPT
CHECKPOINT_FORMAT="qq-quantum-checkpoint-v2"
SPLIT_POLICY="contiguous-90-10-v1"

def _atomic_torch_save(payload:dict,path:Path):
    path.parent.mkdir(parents=True,exist_ok=True)
    tmp=path.with_suffix(path.suffix+".tmp")
    torch.save(payload,tmp);tmp.replace(path)

def _batch(data,batch_size,block_size,device):
    max_start=len(data)-block_size-1
    if max_start<0: raise ValueError("Token sequence is too short")
    starts=torch.randint(0,max_start+1,(batch_size,))
    x=torch.stack([data[int(i):int(i)+block_size] for i in starts])
    y=torch.stack([data[int(i)+1:int(i)+block_size+1] for i in starts])
    return x.to(device),y.to(device)

def _validation_loss(model,data,block_size,batch_size,device,max_batches=16):
    max_start=len(data)-block_size-1
    if max_start<0:return None
    count=min(max_batches,max_start+1)
    starts=torch.linspace(0,max_start,steps=count).round().to(torch.long).unique()
    x=torch.stack([data[int(i):int(i)+block_size] for i in starts]).to(device)
    y=torch.stack([data[int(i)+1:int(i)+block_size+1] for i in starts]).to(device)
    was_training=model.training;model.eval()
    with torch.inference_mode(): _,loss=model(x,y)
    if was_training:model.train()
    return float(loss.detach().cpu())

def train(*,corpus_path:str,output_dir:str,max_steps:int=300,batch_size:int=16,block_size:int=128,
          learning_rate:float=3e-4,vocab_size:int=512,n_layer:int=2,n_head:int=4,n_embd:int=128,
          dropout:float=0.1,seed:int=1337,device:str="auto",resume:bool=False,
          checkpoint_interval:int=50,stop_at_step:int|None=None,validation_fraction:float=0.1):
    if max_steps<0 or batch_size<1 or checkpoint_interval<1 or (stop_at_step is not None and stop_at_step<0):
        raise ValueError("Invalid training limits")
    if not 0.05<=validation_fraction<=0.3 or learning_rate<=0: raise ValueError("Invalid training settings")
    resolved="cuda" if device=="auto" and torch.cuda.is_available() else ("cpu" if device=="auto" else device)
    if resolved not in {"cpu","cuda","mps"}: raise ValueError("Unsupported device")
    if resolved=="cuda" and not torch.cuda.is_available(): raise RuntimeError("CUDA unavailable")
    if resolved=="mps" and not (hasattr(torch.backends,"mps") and torch.backends.mps.is_available()): raise RuntimeError("MPS unavailable")
    output=Path(output_dir);output.mkdir(parents=True,exist_ok=True)
    corpus=Path(corpus_path).read_text(encoding="utf-8")
    corpus_sha=hashlib.sha256(corpus.encode()).hexdigest()
    if len(corpus)<block_size*2+4: raise ValueError("Corpus too short")
    tok_path,ckpt_path=output/"tokenizer.json",output/"latest.pt"
    requested={"seed":seed,"batch_size":batch_size,"block_size":block_size,"learning_rate":learning_rate,
       "vocab_size":vocab_size,"n_layer":n_layer,"n_head":n_head,"n_embd":n_embd,"dropout":dropout,
       "validation_fraction":validation_fraction,"split_policy":SPLIT_POLICY}
    if resume and ckpt_path.exists():
        tokenizer=ByteBPETokenizer.load(tok_path)
        ckpt=torch.load(ckpt_path,map_location="cpu",weights_only=False)
        saved=ckpt.get("training",{})
        if saved.get("split_policy")!=SPLIT_POLICY or saved.get("corpus_sha256")!=corpus_sha:
            raise ValueError("Checkpoint format or corpus mismatch")
        for key,value in requested.items():
            if key in saved and saved[key]!=value: raise ValueError(f"Cannot change {key} when resuming")
        cfg=GPTConfig(**ckpt["model_config"])
        if cfg.block_size!=block_size or cfg.vocab_size!=tokenizer.real_size: raise ValueError("Model/tokenizer mismatch")
        model=QuantumGPT(cfg);model.load_state_dict(ckpt["model"]);model.to(resolved)
        optimizer=AdamW(model.parameters(),lr=learning_rate);optimizer.load_state_dict(ckpt["optimizer"])
        start_step=int(ckpt["step"])+1
        random.setstate(ckpt["python_rng"]);np.random.set_state(ckpt["numpy_rng"]);torch.set_rng_state(ckpt["torch_rng"])
    else:
        random.seed(seed);np.random.seed(seed);torch.manual_seed(seed)
        tokenizer=ByteBPETokenizer(vocab_size).train(corpus,vocab_size=vocab_size);tokenizer.save(tok_path)
        cfg=GPTConfig(vocab_size=tokenizer.real_size,block_size=block_size,n_layer=n_layer,n_head=n_head,n_embd=n_embd,dropout=dropout)
        model=QuantumGPT(cfg).to(resolved);optimizer=AdamW(model.parameters(),lr=learning_rate);start_step=0
    data=torch.tensor(tokenizer.encode(corpus),dtype=torch.long)
    split=int(len(data)*(1.0-validation_fraction));split=max(block_size+2,min(split,len(data)-block_size-2))
    train_data,val_data=data[:split],data[split:]
    if len(train_data)<block_size+2 or len(val_data)<block_size+2: raise ValueError("Corpus too short after split")
    target=min(max_steps,stop_at_step) if stop_at_step is not None else max_steps
    if target<start_step:return {"trained":False,"final_step":start_step-1,"device":resolved}
    history=[];last_loss=None;last_val=None
    def save(step,loss):
        nonlocal last_val
        last_val=_validation_loss(model,val_data,block_size,batch_size,resolved)
        payload={"format":CHECKPOINT_FORMAT,"step":step,"model_config":model.config_dict(),"model":model.state_dict(),
          "optimizer":optimizer.state_dict(),"loss":loss,"validation_loss":last_val,"python_rng":random.getstate(),
          "numpy_rng":np.random.get_state(),"torch_rng":torch.get_rng_state(),
          "cuda_rng":torch.cuda.get_rng_state_all() if resolved=="cuda" else None,
          "training":{**requested,"corpus_path":str(corpus_path),"corpus_sha256":corpus_sha,
            "corpus_characters":len(corpus),"corpus_tokens":len(data),"train_tokens":len(train_data),"validation_tokens":len(val_data)}}
        _atomic_torch_save(payload,ckpt_path)
    if target==0 and start_step==0:save(-1,None)
    for step in range(start_step,target):
        model.train();x,y=_batch(train_data,batch_size,block_size,resolved)
        _,loss=model(x,y);optimizer.zero_grad(set_to_none=True);loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(),1.0);optimizer.step()
        last_loss=float(loss.detach().cpu());history.append(last_loss)
        completed=step+1
        if completed%checkpoint_interval==0 or completed==target:save(step,last_loss)
    return {"trained":bool(history),"start_step":start_step,"final_step":target-1 if history else start_step-1,
      "steps_run":len(history),"last_loss":last_loss,"validation_loss":last_val,"device":resolved,
      "checkpoint":str(ckpt_path),"tokenizer":str(tok_path)}

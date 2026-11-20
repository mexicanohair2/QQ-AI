"""Small decoder-only Transformer initialized from random weights."""
from __future__ import annotations
from dataclasses import asdict, dataclass
import torch
from torch import nn
from torch.nn import functional as F

@dataclass
class GPTConfig:
    vocab_size: int
    block_size: int = 128
    n_layer: int = 2
    n_head: int = 4
    n_embd: int = 128
    dropout: float = 0.1
    def validate(self):
        if self.vocab_size < 261 or self.block_size < 8 or self.n_layer < 1:
            raise ValueError("Invalid model dimensions")
        if self.n_head < 1 or self.n_embd % self.n_head:
            raise ValueError("n_embd must be divisible by n_head")
        if not 0 <= self.dropout < 1: raise ValueError("dropout must be in [0, 1)")

class CausalSelfAttention(nn.Module):
    def __init__(self, cfg):
        super().__init__()
        self.heads, self.head_dim = cfg.n_head, cfg.n_embd // cfg.n_head
        self.qkv = nn.Linear(cfg.n_embd, 3 * cfg.n_embd)
        self.proj = nn.Linear(cfg.n_embd, cfg.n_embd)
        self.dropout = cfg.dropout
        self.register_buffer("mask", torch.tril(torch.ones(cfg.block_size, cfg.block_size, dtype=torch.bool)).view(1,1,cfg.block_size,cfg.block_size), persistent=False)
    def forward(self, x):
        b,t,c=x.shape
        q,k,v=self.qkv(x).chunk(3,dim=-1)
        q=q.view(b,t,self.heads,self.head_dim).transpose(1,2)
        k=k.view(b,t,self.heads,self.head_dim).transpose(1,2)
        v=v.view(b,t,self.heads,self.head_dim).transpose(1,2)
        y=F.scaled_dot_product_attention(q,k,v,attn_mask=self.mask[:,:,:t,:t],dropout_p=self.dropout if self.training else 0.0)
        return self.proj(y.transpose(1,2).contiguous().view(b,t,c))

class MLP(nn.Module):
    def __init__(self,cfg):
        super().__init__()
        self.net=nn.Sequential(nn.Linear(cfg.n_embd,4*cfg.n_embd),nn.GELU(),nn.Linear(4*cfg.n_embd,cfg.n_embd),nn.Dropout(cfg.dropout))
    def forward(self,x): return self.net(x)

class Block(nn.Module):
    def __init__(self,cfg):
        super().__init__()
        self.ln1,self.ln2=nn.LayerNorm(cfg.n_embd),nn.LayerNorm(cfg.n_embd)
        self.attn,self.mlp=CausalSelfAttention(cfg),MLP(cfg)
    def forward(self,x):
        x=x+self.attn(self.ln1(x))
        return x+self.mlp(self.ln2(x))

class QuantumGPT(nn.Module):
    def __init__(self,cfg:GPTConfig):
        super().__init__();cfg.validate();self.config=cfg
        self.token_embedding=nn.Embedding(cfg.vocab_size,cfg.n_embd)
        self.position_embedding=nn.Embedding(cfg.block_size,cfg.n_embd)
        self.drop=nn.Dropout(cfg.dropout)
        self.blocks=nn.Sequential(*[Block(cfg) for _ in range(cfg.n_layer)])
        self.final_norm=nn.LayerNorm(cfg.n_embd)
        self.lm_head=nn.Linear(cfg.n_embd,cfg.vocab_size,bias=False)
        self.lm_head.weight=self.token_embedding.weight
        self.apply(self._init_weights)
    @staticmethod
    def _init_weights(module):
        if isinstance(module,nn.Linear):
            nn.init.normal_(module.weight,mean=0.0,std=0.02)
            if module.bias is not None: nn.init.zeros_(module.bias)
        elif isinstance(module,nn.Embedding): nn.init.normal_(module.weight,mean=0.0,std=0.02)
    def forward(self,idx,targets=None):
        b,t=idx.shape
        if t>self.config.block_size: raise ValueError("Sequence exceeds block_size")
        pos=torch.arange(t,device=idx.device)
        x=self.drop(self.token_embedding(idx)+self.position_embedding(pos)[None,:,:])
        logits=self.lm_head(self.final_norm(self.blocks(x)))
        loss=F.cross_entropy(logits.reshape(-1,logits.size(-1)),targets.reshape(-1)) if targets is not None else None
        return logits,loss
    @torch.no_grad()
    def generate(self,idx,max_new_tokens=100,temperature=0.8,top_k=40,eos_token_id=2):
        if temperature<=0: raise ValueError("temperature must be > 0")
        if top_k<0 or max_new_tokens<0: raise ValueError("Invalid generation parameters")
        self.eval()
        for _ in range(max_new_tokens):
            logits,_=self(idx[:,-self.config.block_size:])
            logits=logits[:,-1,:]/temperature
            if top_k and top_k<logits.size(-1):
                values,_=torch.topk(logits,top_k)
                logits[logits<values[:,-1,None]]=-float("inf")
            next_id=torch.multinomial(F.softmax(logits,dim=-1),num_samples=1)
            idx=torch.cat((idx,next_id),dim=1)
            if eos_token_id is not None and int(next_id.item())==eos_token_id: break
        return idx
    def config_dict(self): return asdict(self.config)

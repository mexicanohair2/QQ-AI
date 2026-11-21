/* QQ Quantum browser runtime. Pure JavaScript; no external model/runtime imports. */
(function (root) {
  "use strict";
  const BYTE_BASE = 5;
  const SPECIAL = { "<PAD>": 0, "<BOS>": 1, "<EOS>": 2, "<USER>": 3, "<ASSISTANT>": 4 };
  function decodeBase64(value) {
    const raw = atob(value); const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  class ByteBPETokenizer {
    constructor(payload) {
      if (!payload || payload.format !== "qq-byte-bpe-v1") throw new Error("Unsupported tokenizer format");
      if (JSON.stringify(payload.special_tokens) !== JSON.stringify(SPECIAL)) throw new Error("Invalid special tokens");
      this.special = payload.special_tokens; this.tokens = new Map();
      for (const [key, value] of Object.entries(payload.tokens)) this.tokens.set(Number(key), decodeBase64(value));
      this.merges = payload.merges.map(row => row.map(Number)); this.rank = new Map(); this.mergeId = new Map();
      this.merges.forEach(([a,b,id], rank) => { this.rank.set(a + "," + b, rank); this.mergeId.set(a + "," + b, id); });
      this.realSize = Number(payload.real_size);
      this.specialPattern = new RegExp("(" + Object.keys(SPECIAL).sort((a,b)=>b.length-a.length).map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|") + ")", "g");
      for (let i=BYTE_BASE;i<BYTE_BASE+256;i++){const b=this.tokens.get(i);if(!b||b.length!==1||b[0]!==i-BYTE_BASE)throw new Error("Corrupt base byte token");}
      if(this.merges.length+261!==this.realSize)throw new Error("Corrupt BPE merge count");
    }
    encodeBytes(bytes) {
      let ids=Array.from(bytes,b=>BYTE_BASE+b);
      while(ids.length>1){
        let bestRank=Infinity,bestPair=null;
        for(let i=0;i<ids.length-1;i++){const key=ids[i]+","+ids[i+1],rank=this.rank.get(key);if(rank!==undefined&&rank<bestRank){bestRank=rank;bestPair=key;}}
        if(bestPair===null)break;
        const [a,b]=bestPair.split(",").map(Number),mergedId=this.mergeId.get(bestPair),merged=[];
        for(let i=0;i<ids.length;){if(i+1<ids.length&&ids[i]===a&&ids[i+1]===b){merged.push(mergedId);i+=2;}else{merged.push(ids[i]);i++;}}
        ids=merged;
      }
      return ids;
    }
    encode(text,addBos=false,addEos=false){
      if(typeof text!=="string")throw new TypeError("text must be a string");
      const pieces=text.split(this.specialPattern),ids=addBos?[this.special["<BOS>"]]:[],encoder=new TextEncoder();
      for(const part of pieces){if(!part)continue;if(Object.prototype.hasOwnProperty.call(this.special,part))ids.push(this.special[part]);else ids.push(...this.encodeBytes(encoder.encode(part)));}
      if(addEos)ids.push(this.special["<EOS>"]);return ids;
    }
    decode(ids,skipSpecial=true){
      const chunks=[];let size=0;const reverse=new Map(Object.entries(this.special).map(([k,v])=>[v,k]));
      for(const rawId of ids){const id=Number(rawId);if(reverse.has(id)){if(!skipSpecial){const b=new TextEncoder().encode(reverse.get(id));chunks.push(b);size+=b.length;}continue;}const bytes=this.tokens.get(id);if(!bytes)throw new Error("Unknown token ID: "+id);chunks.push(bytes);size+=bytes.length;}
      const joined=new Uint8Array(size);let offset=0;for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.length;}
      return new TextDecoder("utf-8",{fatal:false}).decode(joined);
    }
  }
  function erf(x){const sign=x<0?-1:1;x=Math.abs(x);const t=1/(1+0.3275911*x);const p=(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*t;return sign*(1-p*Math.exp(-x*x));}
  class QuantumBrowserModel {
    constructor(metadata,weightsBuffer){
      if(!metadata||metadata.format!=="qq-quantum-web-weights-v1")throw new Error("Unsupported browser model format");
      if(weightsBuffer.byteLength!==metadata.weight_bytes)throw new Error("Model weight size mismatch");
      this.meta=metadata;this.cfg=metadata.model_config;this.C=this.cfg.n_embd;this.H=this.cfg.n_head;this.D=this.C/this.H;this.B=this.cfg.block_size;this.weights=new Map();
      for(const [name,spec] of Object.entries(metadata.tensors)){const start=spec.offset,end=start+spec.length*4;if(end>weightsBuffer.byteLength||start%4!==0)throw new Error("Corrupt tensor offset: "+name);this.weights.set(name,new Float32Array(weightsBuffer.slice(start,end)));}
      this._validateWeights();
    }
    _validateWeights(){
      const required=["token_embedding.weight","position_embedding.weight","final_norm.weight","final_norm.bias","lm_head.weight"];
      for(const key of required)if(!this.weights.has(key))throw new Error("Missing model tensor: "+key);
      for(let l=0;l<this.cfg.n_layer;l++)for(const name of ["ln1.weight","ln1.bias","ln2.weight","ln2.bias","attn.qkv.weight","attn.qkv.bias","attn.proj.weight","attn.proj.bias","mlp.net.0.weight","mlp.net.0.bias","mlp.net.2.weight","mlp.net.2.bias"])if(!this.weights.has("blocks."+l+"."+name))throw new Error("Missing model tensor: "+name);
    }
    w(name){const r=this.weights.get(name);if(!r)throw new Error("Missing tensor: "+name);return r;}
    linear(x,rows,inputSize,outputSize,prefix){
      const w=this.w(prefix+".weight"),b=this.w(prefix+".bias"),y=new Float32Array(rows*outputSize);
      for(let r=0;r<rows;r++){const xi=r*inputSize,yi=r*outputSize;for(let o=0;o<outputSize;o++){let sum=b[o],wi=o*inputSize;for(let i=0;i<inputSize;i++)sum+=w[wi+i]*x[xi+i];y[yi+o]=sum;}}
      return y;
    }
    layerNorm(x,rows,prefix){
      const g=this.w(prefix+".weight"),b=this.w(prefix+".bias"),out=new Float32Array(x.length),C=this.C;
      for(let r=0;r<rows;r++){const off=r*C;let mean=0;for(let i=0;i<C;i++)mean+=x[off+i];mean/=C;let variance=0;for(let i=0;i<C;i++){const d=x[off+i]-mean;variance+=d*d;}variance/=C;const inv=1/Math.sqrt(variance+1e-5);for(let i=0;i<C;i++)out[off+i]=(x[off+i]-mean)*inv*g[i]+b[i];}
      return out;
    }
    attention(qkv,rows,prefix){
      const C=this.C,H=this.H,D=this.D,out=new Float32Array(rows*C),scale=1/Math.sqrt(D),scores=new Float64Array(rows);
      for(let h=0;h<H;h++){const base=h*D;for(let t=0;t<rows;t++){let max=-Infinity;for(let j=0;j<=t;j++){let dot=0;const qb=t*3*C+base,kb=j*3*C+C+base;for(let d=0;d<D;d++)dot+=qkv[qb+d]*qkv[kb+d];scores[j]=dot*scale;if(scores[j]>max)max=scores[j];}let sum=0;for(let j=0;j<=t;j++){scores[j]=Math.exp(scores[j]-max);sum+=scores[j];}for(let d=0;d<D;d++){let v=0;for(let j=0;j<=t;j++)v+=scores[j]/sum*qkv[j*3*C+2*C+base+d];out[t*C+base+d]=v;}}}
      return this.linear(out,rows,C,C,prefix+".proj");
    }
    mlp(x,rows,prefix){const C=this.C,h=this.linear(x,rows,C,C*4,prefix+".net.0");for(let i=0;i<h.length;i++)h[i]=0.5*h[i]*(1+erf(h[i]/Math.SQRT2));return this.linear(h,rows,C*4,C,prefix+".net.2");}
    prefill(tokenIds){
      if(!tokenIds.length)throw new Error("Prompt must not contain at least one token");
      const ids=tokenIds.slice(-this.B),T=ids.length,C=this.C,emb=this.w("token_embedding.weight"),pos=this.w("position_embedding.weight");let x=new Float32Array(T*C);
      for(let t=0;t<T;t++){const id=ids[t];if(id<0||id>=this.cfg.vocab_size)throw new Error("Token id outside model vocabulary");for(let c=0;c<C;c++)x[t*C+c]=emb[id*C+c]+pos[t*C+c];}
      const caches=[];
      for(let layer=0;layer<this.cfg.n_layer;layer++){const base="blocks."+layer,n1=this.layerNorm(x,T,base+".ln1"),qkv=this.linear(n1,T,C,3*C,base+".attn.qkv"),a=this.attention(qkv,T,base+".attn");for(let i=0;i<x.length;i++)x[i]+=a[i];const n2=this.layerNorm(x,T,base+".ln2"),ff=this.mlp(n2,T,base+".mlp");for(let i=0;i<x.length;i++)x[i]+=ff[i];const keys=new Float32Array(T*C),values=new Float32Array(T*C);for(let t=0;t<T;t++)for(let c=0;c<C;c++){keys[t*C+c]=qkv[t*3*C+C+c];values[t*C+c]=qkv[t*3*C+2*C+c];}caches.push({keys,values});}
      return {logits:this.lastLogits(x.subarray((T-1)*C,T*C)),caches,length:T};
    }
    lastLogits(hidden){const norm=this.layerNorm(hidden,1,"final_norm"),w=this.w("lm_head.weight"),vocab=this.cfg.vocab_size,C=this.C,logits=new Float32Array(vocab);for(let token=0;token<vocab;token++){let sum=0,base=token*C;for(let c=0;c<C;c++)sum+=w[base+c]*norm[c];logits[token]=sum;}return logits;}
    step(tokenId,position,caches){
      const C=this.C,H=this.H,D=this.D;if(position>=this.B)throw new Error("Browser context reached block_size");const emb=this.w("token_embedding.weight"),pos=this.w("position_embedding.weight");let x=new Float32Array(C);for(let c=0;c<C;c++)x[c]=emb[tokenId*C+c]+pos[position*C+c];
      for(let layer=0;layer<this.cfg.n_layer;layer++){const base="blocks."+layer,n1=this.layerNorm(x,1,base+".ln1"),qkv=this.linear(n1,1,C,3*C,base+".attn.qkv"),old=caches[layer],oldLength=old.keys.length/C,keys=new Float32Array((oldLength+1)*C),values=new Float32Array((oldLength+1)*C);keys.set(old.keys);values.set(old.values);for(let c=0;c<C;c++){keys[oldLength*C+c]=qkv[C+c];values[oldLength*C+c]=qkv[2*C+c];}caches[layer]={keys,values};const input=new Float32Array(C),scale=1/Math.sqrt(D),scores=new Float64Array(oldLength+1);
        for(let h=0;h<H;h++){const baseHead=h*D;let max=-Infinity;for(let t=0;t<=oldLength;t++){let dot=0;for(let d=0;d<D;d++)dot+=qkv[baseHead+d]*keys[t*C+baseHead+d];scores[t]=dot*scale;if(scores[t]>max)max=scores[t];}let total=0;for(let t=0;t<=oldLength;t++){scores[t]=Math.exp(scores[t]-max);total+=scores[t];}for(let d=0;d<D;d++){let value=0;for(let t=0;t<=oldLength;t++)value+=scores[t]/total*values[t*C+baseHead+d];input[baseHead+d]=value;}}
        const a=this.linear(input,1,C,C,base+".attn.proj");for(let c=0;c<C;c++)x[c]+=a[c];const n2=this.layerNorm(x,1,base+".ln2"),ff=this.mlp(n2,1,base+".mlp");for(let c=0;c<C;c++)x[c]+=ff[c];
      }return this.lastLogits(x);
    }
    sample(logits,temperature,topK){if(!(temperature>0))throw new Error("temperature must be positive");const candidates=[];for(let i=0;i<logits.length;i++)candidates.push([i,logits[i]/temperature]);candidates.sort((a,b)=>b[1]-a[1]);const count=topK>0?Math.min(topK,candidates.length):candidates.length,cutoff=candidates[count-1][1];let total=0;for(let i=0;i<count;i++){candidates[i][1]=Math.exp(candidates[i][1]-cutoff);total+=candidates[i][1];}let pick=Math.random()*total;for(let i=0;i<count;i++){pick-=candidates[i][1];if(pick<=0)return candidates[i][0];}return candidates[0][0];}
    generate(promptIds,maxNewTokens=48,temperature=0.75,topK=30,eosTokenId=2){const context=promptIds.slice(-this.B);if(!context.length)throw new Error("Prompt must not be empty");const pre=this.prefill(context);let logits=pre.logits,caches=pre.caches,position=pre.length;const generated=[];for(let i=0;i<Math.min(maxNewTokens,this.B-position);i++){const token=this.sample(logits,temperature,topK);generated.push(token);if(token===eosTokenId)break;position++;if(position>=this.B)break;logits=this.step(token,position-1,caches);}return generated;}
  }
  async function inflateGzipBase64(value){const compressed=decodeBase64(value);if(typeof DecompressionStream!=="function")throw new Error("This browser does not support offline model decompression. Use a recent Chrome version.");const stream=new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"));return await new Response(stream).arrayBuffer();}
  root.QQQuantumBrowser={ByteBPETokenizer,QuantumBrowserModel,inflateGzipBase64,erf};
})(globalThis);

// Platform-independent UTF-8, SHA-256 and CRC32 for durable files and backup ZIPs.
'use strict'
function utf8(s) {
 const out=[]
 for(const c of s){const n=c.codePointAt(0);if(n<128)out.push(n);else if(n<2048)out.push(192|(n>>6),128|(n&63));else if(n<65536)out.push(224|(n>>12),128|((n>>6)&63),128|(n&63));else out.push(240|(n>>18),128|((n>>12)&63),128|((n>>6)&63),128|(n&63))}
 return new Uint8Array(out)
}
function decode(a){
 let out=''
 for(let i=0;i<a.length;){const b=a[i++];let n,more,min;if(b<128){n=b;more=0;min=0}else if(b>=194&&b<224){n=b&31;more=1;min=128}else if(b>=224&&b<240){n=b&15;more=2;min=2048}else if(b>=240&&b<245){n=b&7;more=3;min=65536}else throw Error('无效 UTF-8')
  while(more--){if(i>=a.length||(a[i]&192)!==128)throw Error('无效 UTF-8');n=(n<<6)|(a[i++]&63)}
  if(n<min||n>1114111||(n>=55296&&n<=57343))throw Error('无效 UTF-8');out+=String.fromCodePoint(n)
 }return out
}
const K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]
const ro=(n,b)=>(n>>>b)|(n<<(32-b))
class SHA256{
 constructor(){this.h=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];this.pending=[];this.length=0}
 block(a){const w=new Uint32Array(64);for(let i=0;i<16;i++)w[i]=((a[i*4]<<24)|(a[i*4+1]<<16)|(a[i*4+2]<<8)|a[i*4+3])>>>0;for(let i=16;i<64;i++)w[i]=(w[i-16]+(ro(w[i-15],7)^ro(w[i-15],18)^(w[i-15]>>>3))+w[i-7]+(ro(w[i-2],17)^ro(w[i-2],19)^(w[i-2]>>>10)))>>>0;let[a0,b,c,d,e,f,g,h]=this.h;for(let i=0;i<64;i++){const t=(h+(ro(e,6)^ro(e,11)^ro(e,25))+((e&f)^(~e&g))+K[i]+w[i])>>>0,u=((ro(a0,2)^ro(a0,13)^ro(a0,22))+((a0&b)^(a0&c)^(b&c)))>>>0;h=g;g=f;f=e;e=(d+t)>>>0;d=c;c=b;b=a0;a0=(t+u)>>>0}this.h=this.h.map((v,i)=>(v+[a0,b,c,d,e,f,g,h][i])>>>0)}
 update(a){if(typeof a==='string')a=utf8(a);this.length+=a.length;for(const b of a){this.pending.push(b);if(this.pending.length===64){this.block(this.pending);this.pending=[]}}return this}
 digest(){const tail=this.pending.slice();tail.push(128);while(tail.length%64!==56)tail.push(0);const bits=this.length*8;for(let i=7;i>=0;i--)tail.push(Math.floor(bits/2**(i*8))&255);for(let i=0;i<tail.length;i+=64)this.block(tail.slice(i,i+64));return this.h.map(n=>n.toString(16).padStart(8,'0')).join('')}
}
function sha256(a){return new SHA256().update(a).digest()}
function crc32(a,previous=0){let c=(previous^0xffffffff)>>>0;for(const b of a){c^=b;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0)}return(c^0xffffffff)>>>0}
module.exports={utf8,decode,SHA256,sha256,crc32}

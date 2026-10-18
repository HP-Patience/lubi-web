// PUBLIC SYNTHETIC REVIEW ONLY. Never import environment.mjs, production .env, DB or key files.
// The ordinary production server/auth/CSP code is unchanged. This disposable proxy supplies
// a session for its own freshly created test database so an embedded reviewer need not log in.
import { createServer } from 'node:http';
import { once } from 'node:events';
import { startApp, seed, testPassword } from '../test/support.mjs';
process.env.TZ='Asia/Shanghai';
const app=await startApp();
const now=new Date();await seed(app,new Date(now.getFullYear(),now.getMonth(),now.getDate(),14,0,0));
const fixtureDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(now);
let cookie=app.cookie;
const css=`:root{--review-banner-height:38px}html,body{margin:0}.review-banner{box-sizing:border-box;height:var(--review-banner-height);display:flex;align-items:center;gap:15px;padding:0 18px;background:#fff4d8;color:#5a4517;border-bottom:1px solid #e6d5ab;font:12px/1.4 system-ui,sans-serif}.review-banner strong{font-weight:650}.review-banner small{margin-left:auto;font-size:11px}.review-banner button{background:transparent;border:1px solid #cbb985;border-radius:5px;color:inherit;padding:3px 8px;cursor:pointer;font:inherit}#root{height:calc(100dvh - var(--review-banner-height))!important}@media(max-width:600px){:root{--review-banner-height:54px}.review-banner{gap:8px;padding:5px 12px;flex-wrap:wrap;align-content:center}.review-banner small{display:none}.review-banner span{font-size:10px}.review-banner button{margin-left:auto;font-size:10px}}`;
const banner=`<div class="review-banner" role="note"><strong>界面审核 · 公用合成演示</strong><span>不影响正式版，请勿输入真实信息</span><small>外网 AI 请求和密钥写入已禁用</small><button type="button" id="review-date">演示日期 ${fixtureDate}</button></div>`;
const script=`document.getElementById('review-date')?.addEventListener('click',()=>{const field=document.querySelector('.lubi-date-picker');if(field){field.value=${JSON.stringify(fixtureDate)};field.dispatchEvent(new Event('change',{bubbles:true}));}});`;
async function renew(){const r=await fetch(app.base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:testPassword})});if(!r.ok)throw Error('Synthetic session could not be renewed');cookie=r.headers.get('set-cookie').split(';')[0];}
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://review.invalid');
  // Fail closed on route aliases; this proxy deliberately disables all network/key writes.
  if(url.pathname.includes('%')||url.pathname.includes('//')||url.pathname.includes('\\')){res.writeHead(400,{'content-type':'application/json'});res.end(JSON.stringify({error:'合成审核拒绝非规范路径。请使用界面中的正常入口。'}));return;}
  const routePath=url.pathname.toLowerCase();
  if(url.pathname==='/__review/demo.css'){res.writeHead(200,{'content-type':'text/css'});res.end(css);return;}
  if(url.pathname==='/__review/banner.js'){res.writeHead(200,{'content-type':'text/javascript'});res.end(script);return;}
  if(url.pathname==='/__review/info'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({syntheticOnly:true,productionTouched:false,externalAiDisabled:true,fixtureDate}));return;}
  if(routePath.startsWith('/api/network')||(routePath.startsWith('/api/secrets')&&!['GET','HEAD'].includes(req.method))){res.writeHead(403,{'content-type':'application/json'});res.end(JSON.stringify({error:'公用审核演示不发起真实 AI 请求，也不接受真实密钥。正式版实现未改变；AI 与密钥流程已由隔离模拟测试覆盖。'}));return;}
  const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>26*1024*1024){res.writeHead(413);res.end('Review upload too large');return;}chunks.push(chunk);}
  const body=chunks.length?Buffer.concat(chunks):undefined;
  const options=()=>({method:req.method,headers:{cookie,origin:app.base,...(req.headers['content-type']?{'content-type':req.headers['content-type']}:{} )},body,redirect:'manual'});
  // Use only the owned loopback app. A request URL can never select another upstream host.
  const target=app.base+url.pathname+url.search;
  let response=await fetch(target,options());
  if(response.status===401&&url.pathname!=='/api/auth/login'){await renew();response=await fetch(target,options());}
  const headers={};response.headers.forEach((value,key)=>{if(!['content-length','content-encoding','transfer-encoding','connection','set-cookie','x-frame-options'].includes(key))headers[key]=value;});
  if(headers['content-security-policy'])headers['content-security-policy']=headers['content-security-policy'].replace(/frame-ancestors[^;]*(;|$)/g,'')+'; frame-ancestors *';
  let data=Buffer.from(await response.arrayBuffer());
  if((headers['content-type']||'').includes('text/html')){let html=data.toString('utf8');html=html.replace('</head>','<link rel="stylesheet" href="/__review/demo.css"></head>').replace(/<body([^>]*)>/,`<body$1>${banner}`).replace('</body>','<script src="/__review/banner.js" defer></script></body>');data=Buffer.from(html);}
  res.writeHead(response.status,headers);res.end(data);
 }catch(error){if(!res.headersSent)res.writeHead(502,{'content-type':'application/json'});res.end(JSON.stringify({error:'演示代理未完成请求：'+error.message}));}
});
const host=process.env.LUBI_REVIEW_HOST||'0.0.0.0';
try {server.listen(Number(process.env.LUBI_REVIEW_PORT||4175),host);await once(server,'listening');}
catch(error){await app.stop();throw error;}
console.log('SYNTHETIC_REVIEW_READY http://'+host+':'+server.address().port+'; synthetic demo; production untouched; no server deployment.');
let stopping=false;const stop=async()=>{if(stopping)return;stopping=true;server.close();await app.stop();process.exit(0);};
process.on('SIGTERM',()=>void stop());process.on('SIGINT',()=>void stop());

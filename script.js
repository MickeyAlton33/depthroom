const depthCanvas = document.querySelector('#depthCanvas');
const depthCtx = depthCanvas.getContext('2d', { willReadFrequently: true });
const stereoCanvas = document.querySelector('#stereoCanvas');
const stereoCtx = stereoCanvas.getContext('2d');
const loading = document.querySelector('#loading');

let pattern = 'confetti';
let tool = 'paint';
let drawing = false;
let lastPoint = null;
let seed = 428;
let renderTimer;
let toastTimer;
const history = [];
let palette = 'sunshine';
let currentView = 'stereo';
let customTexture = null;
const paletteSets = {
  sunshine:[[247,193,54],[245,103,70],[31,94,72],[237,231,203],[56,111,145],[210,73,85]],
  lagoon:[[186,242,233],[22,166,161],[5,68,94],[240,249,232],[58,123,132],[255,193,94]],
  ultraviolet:[[251,202,239],[166,93,226],[51,32,117],[255,235,175],[94,57,168],[240,98,154]],
  noir:[[238,238,234],[148,148,143],[21,21,21],[205,205,198],[78,78,76],[252,252,246]]
};

function showToast(message) {
  const el=document.querySelector('#toast');el.textContent=message;el.classList.add('show');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2200);
}
function saveHistory(){
  history.push(depthCtx.getImageData(0,0,depthCanvas.width,depthCanvas.height));
  if(history.length>12)history.shift();
  document.querySelector('#undoDepth').disabled=history.length===0;
}

const seededRandom = (initial) => {
  let s = initial >>> 0;
  return () => ((s = Math.imul(1664525, s) + 1013904223 >>> 0) / 4294967296);
};

function clearDepth(render = true) {
  depthCtx.fillStyle = '#050505';
  depthCtx.fillRect(0, 0, depthCanvas.width, depthCanvas.height);
  if (render) scheduleRender();
}

function softCircle(x, y, radius, strength = 1) {
  const gradient = depthCtx.createRadialGradient(x, y, 0, x, y, radius);
  const level = Math.round(255 * strength);
  gradient.addColorStop(0, `rgb(${level},${level},${level})`);
  gradient.addColorStop(.58, `rgb(${Math.round(level*.72)},${Math.round(level*.72)},${Math.round(level*.72)})`);
  gradient.addColorStop(1, '#050505');
  depthCtx.fillStyle = gradient;
  depthCtx.beginPath(); depthCtx.arc(x, y, radius, 0, Math.PI * 2); depthCtx.fill();
}

function loadPreset(name) {
  saveHistory();
  clearDepth(false);
  const w = depthCanvas.width, h = depthCanvas.height;
  if (name === 'orb') softCircle(w/2, h/2, h*.36);
  if (name === 'heart') {
    depthCtx.save(); depthCtx.translate(w/2, h*.53); depthCtx.scale(3.3,3.3);
    const g=depthCtx.createRadialGradient(0,-15,3,0,0,50);g.addColorStop(0,'#fff');g.addColorStop(1,'#555');depthCtx.fillStyle=g;
    depthCtx.beginPath(); depthCtx.moveTo(0,28); depthCtx.bezierCurveTo(-56,-2,-42,-42,-18,-42); depthCtx.bezierCurveTo(-5,-42,0,-30,0,-22); depthCtx.bezierCurveTo(0,-30,5,-42,18,-42); depthCtx.bezierCurveTo(42,-42,56,-2,0,28); depthCtx.fill(); depthCtx.restore();
  }
  if (name === 'type') {
    const g=depthCtx.createLinearGradient(0,h*.25,0,h*.75);g.addColorStop(0,'#fff');g.addColorStop(1,'#777');depthCtx.fillStyle=g;
    depthCtx.textAlign='center';depthCtx.textBaseline='middle';depthCtx.font='bold 180px Manrope, sans-serif';depthCtx.fillText('3D',w/2,h/2+10);
  }
  if (name === 'waves') {
    for(let i=0;i<5;i++){depthCtx.strokeStyle=`rgb(${235-i*28},${235-i*28},${235-i*28})`;depthCtx.lineWidth=26;depthCtx.beginPath();depthCtx.arc(w/2,h*.62,45+i*33,Math.PI,Math.PI*2);depthCtx.stroke();}
  }
  scheduleRender();
}

function applyHiddenText(){
  const text=document.querySelector('#hiddenText').value.trim().slice(0,12).toUpperCase();if(!text){showToast('Enter a hidden message');return;}
  saveHistory();clearDepth(false);const w=depthCanvas.width,h=depthCanvas.height;
  let size=190;depthCtx.font=`900 ${size}px Manrope, sans-serif`;while(depthCtx.measureText(text).width>w*.86&&size>40){size-=4;depthCtx.font=`900 ${size}px Manrope, sans-serif`;}
  const g=depthCtx.createLinearGradient(0,h*.25,0,h*.78);g.addColorStop(0,'#fff');g.addColorStop(.65,'#c8c8c8');g.addColorStop(1,'#686868');depthCtx.fillStyle=g;depthCtx.textAlign='center';depthCtx.textBaseline='middle';depthCtx.fillText(text,w/2,h/2+8);scheduleRender();showToast(`“${text}” hidden in depth`);
}

function texturePixel(rand, x, y) {
  if(customTexture && pattern==='custom') {
    const scale=Number(document.querySelector('#grainScale').value);const sx=Math.floor(x/scale)%customTexture.width,sy=Math.floor(y/scale)%customTexture.height;const i=(sy*customTexture.width+sx)*4;return [customTexture.data[i],customTexture.data[i+1],customTexture.data[i+2]];
  }
  if (pattern === 'mono') {
    const v = rand() > .5 ? (rand()*80|0) : (180+rand()*75|0); return [v,v,v];
  }
  const colors=paletteSets[palette];
  if (pattern === 'botanical') {
    const grain=Number(document.querySelector('#grainScale').value)+3;
    const cellX=Math.floor(x/grain), cellY=Math.floor(y/grain); const n=(cellX*73856093^cellY*19349663^seed)>>>0;
    return colors[n%colors.length];
  }
  if (rand() < .36) return colors[3];
  return colors[Math.floor(rand()*colors.length)];
}

function renderStereogram() {
  loading.style.display='grid';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const w=stereoCanvas.width,h=stereoCanvas.height;
    const depthImage=depthCtx.getImageData(0,0,depthCanvas.width,depthCanvas.height);const depth=depthImage.data;
    if(currentView==='depth'){
      stereoCtx.fillStyle='#050505';stereoCtx.fillRect(0,0,w,h);stereoCtx.imageSmoothingEnabled=true;stereoCtx.drawImage(depthCanvas,0,0,w,h);loading.style.display='none';return;
    }
    const out=stereoCtx.createImageData(w,h); const pixels=out.data;
    const strength=Number(document.querySelector('#depthStrength').value)/100;
    const baseSep=92, shiftMax=28*strength;
    const rand=seededRandom(seed);
    for(let y=0;y<h;y++){
      for(let x=0;x<w;x++){
        const di=((Math.floor(y/h*depthCanvas.height)*depthCanvas.width)+Math.floor(x/w*depthCanvas.width))*4;
        const z=depth[di]/255;
        const separation=Math.round(baseSep-shiftMax*z);
        const oi=(y*w+x)*4;
        if(x>=baseSep){
          const src=(y*w+x-separation)*4;
          pixels[oi]=pixels[src];pixels[oi+1]=pixels[src+1];pixels[oi+2]=pixels[src+2];
        } else {
          const c=texturePixel(rand,x,y);pixels[oi]=c[0];pixels[oi+1]=c[1];pixels[oi+2]=c[2];
        }
        pixels[oi+3]=255;
      }
    }
    stereoCtx.putImageData(out,0,0);
    loading.style.display='none';
    document.querySelector('#seedLabel').textContent=`SEED ${String(seed).padStart(4,'0')}`;
  }));
}

function scheduleRender(){ clearTimeout(renderTimer); renderTimer=setTimeout(renderStereogram,90); }

function canvasPoint(event) {
  const rect=depthCanvas.getBoundingClientRect();
  return {x:(event.clientX-rect.left)*depthCanvas.width/rect.width,y:(event.clientY-rect.top)*depthCanvas.height/rect.height};
}
function drawBrush(point) {
  const size=Number(document.querySelector('#brushSize').value);
  const flow=Number(document.querySelector('#brushFlow').value)/100;
  const softness=Number(document.querySelector('#brushSoftness').value)/100;
  depthCtx.save();
  depthCtx.globalCompositeOperation=tool==='erase'?'destination-out':'lighter';
  depthCtx.globalAlpha=Math.max(.08,flow*(1-softness*.35));
  depthCtx.shadowBlur=size*softness*.55;depthCtx.shadowColor=tool==='erase'?'#000':'#eee';
  depthCtx.strokeStyle=tool==='erase'?'rgba(0,0,0,1)':'rgba(235,235,235,.75)';
  depthCtx.lineWidth=size; depthCtx.lineCap='round'; depthCtx.lineJoin='round';
  depthCtx.beginPath();
  if(lastPoint) depthCtx.moveTo(lastPoint.x,lastPoint.y); else depthCtx.moveTo(point.x,point.y);
  depthCtx.lineTo(point.x,point.y);depthCtx.stroke();depthCtx.restore();lastPoint=point;
}
depthCanvas.addEventListener('pointerdown',e=>{saveHistory();drawing=true;lastPoint=null;depthCanvas.setPointerCapture(e.pointerId);drawBrush(canvasPoint(e));});
depthCanvas.addEventListener('pointermove',e=>{if(drawing)drawBrush(canvasPoint(e));});
depthCanvas.addEventListener('pointerup',()=>{drawing=false;lastPoint=null;scheduleRender();});

document.querySelectorAll('.preset').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.preset').forEach(b=>b.classList.remove('active'));btn.classList.add('active');loadPreset(btn.dataset.preset);}));
document.querySelectorAll('.tool').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.tool').forEach(b=>b.classList.remove('active'));btn.classList.add('active');tool=btn.dataset.tool;}));
document.querySelectorAll('.pattern').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.pattern').forEach(b=>b.classList.remove('active'));btn.classList.add('active');pattern=btn.dataset.pattern;seed=Math.floor(Math.random()*9999);renderStereogram();}));
document.querySelector('#customPattern').addEventListener('click',()=>{if(!customTexture)document.querySelector('#textureFile').click();});
document.querySelector('#textureFile').addEventListener('change',e=>{const file=e.target.files[0];if(!file)return;const img=new Image();img.onload=()=>{const c=document.createElement('canvas');c.width=96;c.height=96;const cx=c.getContext('2d');cx.drawImage(img,0,0,96,96);customTexture=cx.getImageData(0,0,96,96);URL.revokeObjectURL(img.src);pattern='custom';renderStereogram();showToast('Custom texture loaded');};img.src=URL.createObjectURL(file);e.target.value='';});
document.querySelectorAll('.palette').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.palette').forEach(b=>b.classList.remove('active'));btn.classList.add('active');palette=btn.dataset.palette;document.querySelector('#paletteName').textContent=palette.toUpperCase();renderStereogram();}));
document.querySelector('#grainScale').addEventListener('input',scheduleRender);
document.querySelector('#applyText').addEventListener('click',applyHiddenText);document.querySelector('#hiddenText').addEventListener('keydown',e=>{if(e.key==='Enter')applyHiddenText();});
document.querySelector('#depthStrength').addEventListener('input',e=>{document.querySelector('#depthValue').textContent=`${e.target.value}%`;scheduleRender();});
document.querySelector('#clearDepth').addEventListener('click',()=>{saveHistory();document.querySelectorAll('.preset').forEach(b=>b.classList.remove('active'));clearDepth();showToast('Depth map cleared');});
document.querySelector('#undoDepth').addEventListener('click',()=>{const previous=history.pop();if(previous){depthCtx.putImageData(previous,0,0);scheduleRender();}document.querySelector('#undoDepth').disabled=history.length===0;});
document.querySelector('#invertDepth').addEventListener('click',()=>{saveHistory();const image=depthCtx.getImageData(0,0,depthCanvas.width,depthCanvas.height);for(let i=0;i<image.data.length;i+=4){image.data[i]=255-image.data[i];image.data[i+1]=255-image.data[i+1];image.data[i+2]=255-image.data[i+2];}depthCtx.putImageData(image,0,0);scheduleRender();showToast('Depth map inverted');});
document.querySelector('#uploadDepth').addEventListener('click',()=>document.querySelector('#depthFile').click());
document.querySelector('#depthFile').addEventListener('change',e=>{const file=e.target.files[0];if(!file)return;if(!file.type.startsWith('image/')){showToast('Please choose an image file');return;}const img=new Image();img.onload=()=>{saveHistory();clearDepth(false);const scale=Math.max(depthCanvas.width/img.width,depthCanvas.height/img.height);const w=img.width*scale,h=img.height*scale;depthCtx.drawImage(img,(depthCanvas.width-w)/2,(depthCanvas.height-h)/2,w,h);URL.revokeObjectURL(img.src);scheduleRender();showToast('Depth map loaded');};img.src=URL.createObjectURL(file);e.target.value='';});
document.querySelector('#newProject').addEventListener('click',()=>{pattern='confetti';seed=428;document.querySelector('#depthStrength').value=64;document.querySelector('#depthValue').textContent='64%';loadPreset('orb');});
document.querySelector('#regenerate').addEventListener('click',()=>{seed=Math.floor(Math.random()*9999);renderStereogram();});
document.querySelectorAll('.view-switch button').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.view-switch button').forEach(b=>b.classList.remove('active'));btn.classList.add('active');currentView=btn.dataset.view;document.querySelector('.canvas-shell').classList.toggle('depth-mode',currentView==='depth');renderStereogram();}));
document.querySelector('#fullscreen').addEventListener('click',()=>{const shell=document.querySelector('.canvas-shell');if(!document.fullscreenElement)shell.requestFullscreen?.();else document.exitFullscreen?.();});
document.querySelector('#generateMobile').addEventListener('click',()=>{renderStereogram();document.querySelector('.preview-panel').scrollIntoView({behavior:'smooth'});});
document.querySelector('#resolution').addEventListener('change',e=>{const [w,h]=e.target.value.split('x').map(Number);stereoCanvas.width=w;stereoCanvas.height=h;document.querySelector('#resolutionValue').textContent=`${w} × ${h}`;document.querySelector('#sizeLabel').textContent=`${w} × ${h} PX`;renderStereogram();});
document.querySelector('#downloadBtn').addEventListener('click',()=>{if(currentView==='depth')document.querySelector('.view-switch [data-view="stereo"]').click();renderStereogram();setTimeout(()=>{stereoCanvas.toBlob(blob=>{const a=document.createElement('a');a.download=`depthroom-${seed}.png`;a.href=URL.createObjectURL(blob);a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);showToast('PNG exported');},'image/png');},120);});
const dialog=document.querySelector('#helpDialog');document.querySelector('#helpBtn').addEventListener('click',()=>dialog.showModal());document.querySelector('.dialog-close').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();document.querySelector('#undoDepth').click();}if(e.key==='?'&&!dialog.open)dialog.showModal();});

if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));

loadPreset('orb');

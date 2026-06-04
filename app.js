const KEY = 'lineDigitRegisterMvp.v1';
let cameraStream = null;
let lastSnapshotDataUrl = null;
const $ = (s)=>document.querySelector(s);
const $$ = (s)=>Array.from(document.querySelectorAll(s));
const yen = (n)=>'¥'+Number(n||0).toLocaleString('ja-JP');
const nowIso = ()=>new Date().toISOString();
const todayKey = ()=>new Date().toISOString().slice(0,10).replaceAll('-','');
const uid = ()=>crypto.randomUUID ? crypto.randomUUID() : String(Date.now())+Math.random();
let state = load();
let route = {name:'home'};
let stack = [];
let selectedPayment = 'paypay';
let lastNotice = '';
let torchOn = false;
let lineScanMode = 'single';
let singleDigits = ['', '', ''];
let singleAnalysis = [null, null, null];
let singleIndex = 0;

function defaultState(){return {items:[], cart:[], sales:[], recognition_logs:[], settings:{shop_name:'', code_reuse_enabled:false, normal_digit_reading_enabled:true, preferred_payment_methods:['square','paypay','rakuten_pay','cash','other'], quick_price_buttons:[500,800,1000,1200,1500,2000], receipt_message:'ありがとうございました'}}}
function load(){try{const loaded=JSON.parse(localStorage.getItem(KEY))||{}; return {...defaultState(), ...loaded, settings:{...defaultState().settings, ...(loaded.settings||{})}}}catch(e){return defaultState()}}
function save(){localStorage.setItem(KEY, JSON.stringify(state))}
function setTitle(t){$('#title').textContent=t; $('#backBtn').classList.toggle('hidden', stack.length===0)}
function nav(name, params={}){stack.push(route); route={name, params}; render()}
function replace(name, params={}){route={name, params}; render()}
function go(name, params={}){stack=[]; route={name, params}; render()}
function back(){ if(stack.length){ route=stack.pop(); render(); } }
$('#backBtn').onclick=back;
function footer(html){ const f=$('#footer'); if(!html){f.classList.add('hidden'); f.innerHTML=''; return} f.classList.remove('hidden'); f.innerHTML=html; }
function formatDt(iso){ if(!iso) return '-'; const d=new Date(iso); return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`}
function itemName(item){return item.name || `商品 ${item.item_code}`}
function statusLabel(s){return s==='selling'?'販売中':s==='sold'?'販売済み':'非表示'}
function paymentLabel(s){return {square:'Square',paypay:'PayPay',rakuten_pay:'楽天ペイ',cash:'現金',other:'その他'}[s]||s}
function nextItemCode(){
  const used = new Set(state.items.filter(i=>!state.settings.code_reuse_enabled || i.code_reuse_blocked !== false).map(i=>i.item_code));
  for(let n=1;n<=999;n++){const c=String(n).padStart(3,'0'); if(!used.has(c)) return c}
  throw new Error('商品番号が999まで埋まっています')
}
function cartTotal(){return state.cart.reduce((s,x)=>s+x.subtotal,0)}
function activeItems(){return state.items.filter(i=>!i.deleted_at)}
function sellingItems(){return activeItems().filter(i=>i.status==='selling')}
function svgDigit(d, small=false){
  const sw=small?8:7; const dot=small?7:6; const line=`stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" fill="none"`;
  let inner='';
  if(d==='0') inner=`<circle cx="50" cy="50" r="${dot}" fill="currentColor"/>`;
  if(d==='1') inner=`<line x1="50" y1="20" x2="50" y2="80" ${line}/>`;
  if(d==='2') inner=`<line x1="20" y1="50" x2="80" y2="50" ${line}/>`;
  if(d==='3') inner=`<line x1="50" y1="20" x2="50" y2="80" ${line}/><line x1="20" y1="50" x2="80" y2="50" ${line}/>`;
  if(d==='4') inner=`<line x1="22" y1="78" x2="78" y2="22" ${line}/>`;
  if(d==='5') inner=`<line x1="22" y1="22" x2="78" y2="78" ${line}/>`;
  if(d==='6') inner=`<line x1="22" y1="22" x2="78" y2="78" ${line}/><line x1="22" y1="78" x2="78" y2="22" ${line}/>`;
  if(d==='7') inner=`<polyline points="22,78 50,22 78,78" ${line}/>`;
  if(d==='8') inner=`<polyline points="22,22 50,78 78,22" ${line}/>`;
  if(d==='9') inner=`<polygon points="50,16 84,50 50,84 16,50" ${line}/>`;
  return `<svg viewBox="0 0 100 100" aria-label="${d}"><rect x="5" y="5" width="90" height="90" rx="8" fill="white" stroke="currentColor" stroke-width="4"/>${inner}</svg>`;
}
function lineCode(code, cls=''){return `<div class="line-code ${cls}">${String(code).padStart(3,'0').split('').map(d=>svgDigit(d, cls.includes('small'))).join('')}</div>`}
function noticeHtml(){ if(!lastNotice) return ''; const n=lastNotice; lastNotice=''; return `<div class="success">${n}</div>` }
function warnCartHtml(){return state.cart.length?`<div class="notice"><b>未完了カートがあります。</b><br>合計 ${yen(cartTotal())} / ${state.cart.length}件。決済後は必ず「会計完了」を押してください。</div>`:''}

function render(){
  const v=$('#view'); footer(null);
  const pages={home, register, registered, items, editItem, registerSale, lineReader, recognitionLogs, keypad, confirmItem, manualPrice, cart, receiptPreview, payment, saleDone, sales, settings};
  (pages[route.name]||home)(v, route.params||{});
}

function home(v){setTitle('線数字レジ Phase2-12'); const selling=sellingItems().length; const sold=state.items.filter(i=>i.status==='sold').length; v.innerHTML=`<div class="grid">
  ${noticeHtml()}${warnCartHtml()}
  <div class="card"><div class="muted">現在のカート</div><div class="big-total">${yen(cartTotal())}</div><div class="muted">${state.cart.length}件の商品 / 販売中 ${selling}点 / 販売済み ${sold}点</div></div>
  <button class="btn" onclick="go('registerSale')">レジを開く</button>
  <div class="two"><button class="btn secondary" onclick="go('register')">商品登録</button><button class="btn secondary" onclick="go('items')">商品一覧</button></div>
  <div class="two"><button class="btn secondary" onclick="go('sales')">売上履歴</button><button class="btn secondary" onclick="go('settings')">設定</button></div>
  <button class="btn secondary" onclick="go('recognitionLogs')">読み取りログを見る</button>
  <div class="notice">Phase2-12：撮影枠の縦長さを短くし、隣の数字や上下の余白を拾いにくくしました。修正後は3桁番号入力で確認します。</div>
</div>`}

function register(v){setTitle('商品登録'); const buttons=state.settings.quick_price_buttons||[]; v.innerHTML=`<form id="regForm" class="grid card">
  <label>商品写真（必須）</label><input id="photo" type="file" accept="image/*" capture="environment" required><img id="preview" class="hero-img hidden" alt="preview">
  <label>価格（必須）</label><input id="price" type="number" min="1" inputmode="numeric" required placeholder="例：2500"><div class="three">${buttons.map(p=>`<button type="button" class="btn secondary small" data-price="${p}">${yen(p)}</button>`).join('')}</div>
  <label>商品名（任意）</label><input id="name" placeholder="例：陶器ブローチ">
  <label>カテゴリ（任意）</label><input id="category" placeholder="例：アクセサリー">
  <label>メモ（任意）</label><textarea id="memo"></textarea>
  <button class="btn" type="submit">登録する</button>
</form>`;
  let image='';
  $$('#regForm [data-price]').forEach(b=>b.onclick=()=>$('#price').value=b.dataset.price);
  $('#photo').onchange=e=>{const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=()=>{image=r.result; $('#preview').src=image; $('#preview').classList.remove('hidden')}; r.readAsDataURL(f)};
  $('#regForm').onsubmit=e=>{e.preventDefault(); try{ const code=nextItemCode(); const item={id:uid(), item_code:code, name:$('#name').value.trim()||`商品 ${code}`, price:Number($('#price').value), image_uri:image, category:$('#category').value.trim(), memo:$('#memo').value.trim(), status:'selling', created_at:nowIso(), updated_at:nowIso(), sold_at:null, deleted_at:null, code_reuse_blocked:true, sync_status:'pending_create', last_synced_at:null}; if(!image) return alert('商品写真を登録してください'); if(item.price<=0) return alert('価格を入力してください'); state.items.push(item); save(); nav('registered',{id:item.id}); }catch(err){alert(err.message)} };
}

function registered(v,{id}){const item=state.items.find(i=>i.id===id); setTitle('登録完了'); if(!item){v.innerHTML='商品が見つかりません'; return} v.innerHTML=`<div class="grid">
  <div class="success">登録しました。このコードを商品ラベルに書いてください。</div>
  <div class="card grid"><img class="hero-img" src="${item.image_uri}"><div class="code">${item.item_code}</div><div class="price">${yen(item.price)}</div><div>${itemName(item)}</div>${lineCode(item.item_code)}</div>
  <button class="btn" onclick="replace('register')">続けて商品登録</button><button class="btn secondary" onclick="go('registerSale')">すぐレジへ</button><button class="btn secondary" onclick="go('items')">商品一覧へ</button>
</div>`}

function items(v){setTitle('商品一覧'); const q=route.params?.q||''; const st=route.params?.st||'all'; let list=activeItems().filter(i=>(st==='all'||i.status===st) && (`${i.item_code} ${itemName(i)} ${i.category}`.includes(q))); v.innerHTML=`<div class="grid">
  <div class="card grid"><input id="q" placeholder="商品番号・商品名で検索" value="${q}"><select id="st"><option value="all">すべて</option><option value="selling">販売中</option><option value="sold">販売済み</option><option value="hidden">非表示</option></select></div>
  <div class="list">${list.map(itemCard).join('') || '<div class="card muted">商品がありません</div>'}</div>
</div>`; $('#st').value=st; $('#q').oninput=e=>replace('items',{q:e.target.value, st:$('#st').value}); $('#st').onchange=e=>replace('items',{q:$('#q').value, st:e.target.value});}
function itemCard(i){return `<div class="card item ${i.status}"><div class="row"><img class="thumb" src="${i.image_uri||''}"><div style="flex:1"><div class="row between"><b>${i.item_code} ${itemName(i)}</b><span class="badge ${i.status}">${statusLabel(i.status)}</span></div><div class="price">${yen(i.price)}</div><div class="muted">登録 ${formatDt(i.created_at)} / 販売 ${formatDt(i.sold_at)}</div>${lineCode(i.item_code,'small')}<div class="two"><button class="btn secondary small" onclick="nav('editItem',{id:'${i.id}'})">編集</button>${i.status==='selling'?`<button class="btn secondary small" onclick="nav('confirmItem',{id:'${i.id}'})">レジに追加</button>`:''}</div></div></div></div>`}

function editItem(v,{id}){
  const item=state.items.find(i=>i.id===id && !i.deleted_at);
  setTitle('商品編集');
  if(!item){v.innerHTML='<div class="error">商品が見つかりません</div>'; return;}
  v.innerHTML=`<form id="editForm" class="grid card">
    <img class="hero-img" src="${item.image_uri||''}">
    <div class="code">${item.item_code}</div>
    <label>商品写真を変更</label><input id="photo2" type="file" accept="image/*" capture="environment"><img id="preview2" class="hero-img hidden" alt="preview">
    <label>価格</label><input id="price2" type="number" min="1" inputmode="numeric" value="${item.price}" required>
    <label>商品名</label><input id="name2" value="${item.name||''}">
    <label>カテゴリ</label><input id="category2" value="${item.category||''}">
    <label>メモ</label><textarea id="memo2">${item.memo||''}</textarea>
    <label>状態</label><select id="status2"><option value="selling">販売中</option><option value="sold">販売済み</option><option value="hidden">非表示</option></select>
    <button class="btn" type="submit">保存</button>
    <button class="btn secondary" type="button" onclick="go('items')">商品一覧へ戻る</button>
    <button class="btn danger" type="button" id="hideItem">非表示にする</button>
  </form>`;
  $('#status2').value=item.status;
  let image=item.image_uri;
  $('#photo2').onchange=e=>{const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=()=>{image=r.result; $('#preview2').src=image; $('#preview2').classList.remove('hidden')}; r.readAsDataURL(f)};
  $('#editForm').onsubmit=e=>{e.preventDefault(); const oldStatus=item.status; item.price=Number($('#price2').value); if(item.price<=0) return alert('価格を入力してください'); item.name=$('#name2').value.trim()||`商品 ${item.item_code}`; item.category=$('#category2').value.trim(); item.memo=$('#memo2').value.trim(); item.status=$('#status2').value; item.image_uri=image; item.updated_at=nowIso(); if(item.status==='sold' && oldStatus!=='sold') item.sold_at=nowIso(); if(item.status!=='sold') item.sold_at=null; item.sync_status='pending_update'; save(); lastNotice=`${item.item_code} を保存しました。`; go('items');};
  $('#hideItem').onclick=()=>{ if(confirm('この商品を非表示にしますか？販売履歴は残ります。')){ item.status='hidden'; item.updated_at=nowIso(); item.sync_status='pending_update'; save(); go('items'); } };
}


function registerSale(v){setTitle('レジ'); const recent=sellingItems().slice(-3).reverse(); v.innerHTML=`<div class="grid">
  ${noticeHtml()}${warnCartHtml()}
  <div class="card"><div class="muted">合計</div><div class="big-total">${yen(cartTotal())}</div><div class="muted">カート ${state.cart.length}件</div></div>
  <button class="btn" onclick="nav('keypad')">3桁番号を入力</button>
  <button class="btn secondary" onclick="nav('manualPrice')">価格だけ追加</button>
  <button class="btn secondary" onclick="nav('cart')">カートを見る</button>
  <div class="card grid"><b>最近登録した販売中商品</b>${recent.length?recent.map(i=>`<button class="btn secondary small quick-item" onclick="nav('confirmItem',{id:'${i.id}'})">${i.item_code}　${itemName(i)}　${yen(i.price)}</button>`).join(''):'<div class="muted">販売中の商品がありません</div>'}</div>
  <button class="btn" onclick="nav('lineReader')">線数字を読む</button>
  <button class="btn secondary" onclick="alert('通常数字OCRは次フェーズで実装します。線数字カメラ、3桁手入力、価格だけ追加を使ってください。')">通常数字を読む（準備中）</button>
</div>`; if(state.cart.length) footer(`<button class="btn ok" onclick="nav('receiptPreview')">支払いへ進む ${yen(cartTotal())}</button>`)}


function stopCamera(){
  torchOn=false;
  if(cameraStream){ cameraStream.getTracks().forEach(t=>t.stop()); cameraStream=null; }
}
async function setTorch(on){
  const btn=$('#toggleTorch');
  if(!cameraStream){ if(btn) btn.textContent='ライト'; return false; }
  const track=cameraStream.getVideoTracks()[0];
  try{
    const caps = track.getCapabilities ? track.getCapabilities() : {};
    if(!caps.torch){
      if(btn) btn.textContent='ライト非対応';
      const s=$('#cameraStatus'); if(s) s.textContent='この端末/ブラウザではライト制御に対応していません。暗い場合は手元の照明も使ってください。';
      return false;
    }
    await track.applyConstraints({advanced:[{torch:!!on}]});
    torchOn=!!on;
    if(btn) btn.textContent=torchOn ? 'ライトOFF' : 'ライトON';
    return true;
  }catch(e){
    if(btn) btn.textContent='ライト非対応';
    const s=$('#cameraStatus'); if(s) s.textContent='ライトを点灯できませんでした。iPhone Safariでは機種や状態により非対応の場合があります。';
    return false;
  }
}
function signalReadComplete(){
  try{ if(navigator.vibrate) navigator.vibrate([80,40,80]); }catch(e){}
  const n=$('#scanNotice');
  if(n){ n.classList.remove('hidden'); n.textContent='読み取りました。上の番号を確認し、違う桁だけ修正してください。'; }
}
async function startLineCamera(){
  stopCamera();
  const video=$('#cameraVideo');
  if(!video) return;
  try{
    cameraStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}}, audio:false});
    video.srcObject = cameraStream;
    await video.play();
    $('#cameraStatus').textContent='カメラ起動中。1桁ずつ読む場合は、中央の黄色い枠に1つの手書き枠だけを合わせてください。隣の枠は左右の暗いエリアへ外してください。';
    await setTorch(true);
  }catch(e){
    $('#cameraStatus').innerHTML='カメラを起動できませんでした。Safariのカメラ許可を確認するか、手入力を使ってください。';
    $('#cameraFallback').classList.remove('hidden');
  }
}
function lineReader(v){
  setTitle('線数字読み取り');
  stopCamera();
  lastSnapshotDataUrl=null;
  lineScanMode='single'; singleDigits=['','','']; singleAnalysis=[null,null,null]; singleIndex=0;
  v.innerHTML=`<div class="grid">
    <div class="notice"><b>Phase2-12：短い撮影枠＋手動確認優先版</b><br>中央の短い黄色枠に、読みたい1桁だけを入れてください。隣の数字や上下の枠が入らない位置で撮影してください。</div>
    <div id="scanNotice" class="success hidden"></div>
    <canvas id="captureCanvas" class="hidden"></canvas>
    <div id="snapshotArea" class="hidden grid result-top"></div>
    <div class="two"><button class="btn" id="singleModeBtn">1桁ずつ読む</button><button class="btn secondary" id="tripleModeBtn">3桁一括</button></div>
    <div class="camera-wrap">
      <video id="cameraVideo" class="camera" playsinline muted autoplay></video>
      <div class="camera-shade"></div>
      <div class="camera-overlay"></div>
    </div>
    <div id="cameraStatus" class="muted">カメラを起動しています...</div>
    <div class="notice">撮影のコツ：中央の黄色い小枠には1桁だけを入れます。隣の数字や枠は絶対に入れないでください。ぼける場合は15〜25cm程度まで少し離してください。</div>
    <div id="cameraFallback" class="camera-fallback hidden"><button class="btn" onclick="nav('keypad')">3桁手入力へ</button><p class="muted">iPhoneではSafariのカメラ許可が必要です。ホーム画面版で動かない場合はSafariからURLを開いて試してください。</p></div>
    <button class="btn" id="captureBtn">撮影して読み取る</button>
    <div class="two"><button class="btn secondary" id="toggleTorch">ライトON</button><button class="btn secondary" id="restartCam">カメラ再起動</button></div>
    <button class="btn secondary" onclick="stopCamera();nav('keypad')">手入力へ</button>
    <button class="btn secondary" onclick="stopCamera();go('registerSale')">レジへ戻る</button>
  </div>`;
  $('#captureBtn').onclick=captureLineDigits;
  $('#restartCam').onclick=startLineCamera;
  $('#toggleTorch').onclick=()=>setTorch(!torchOn);
  $('#singleModeBtn').onclick=()=>setScanMode('single');
  $('#tripleModeBtn').onclick=()=>setScanMode('triple');
  updateScanOverlay();
  startLineCamera();
}

function setScanMode(mode){
  lineScanMode = mode;
  const singleBtn = $('#singleModeBtn');
  const tripleBtn = $('#tripleModeBtn');
  if(singleBtn) singleBtn.className = mode==='single' ? 'btn' : 'btn secondary';
  if(tripleBtn) tripleBtn.className = mode==='triple' ? 'btn' : 'btn secondary';
  updateScanOverlay();
  const s=$('#cameraStatus');
  if(s){
    s.textContent = mode==='single'
      ? `${['百の位','十の位','一の位'][singleIndex]}：中央の黄色い小枠に1桁だけを入れてください。隣の数字は枠外へ外してください。`
      : '3桁一括：3つの枠をそれぞれ百・十・一の位に合わせてください。';
  }
}
function updateScanOverlay(){
  const overlay=$('.camera-overlay');
  if(!overlay) return;
  const label=['百','十','一'][singleIndex] || '';
  if(lineScanMode==='single'){
    overlay.innerHTML = `<div class="single-focus">
      <div class="side-block">隣の枠は<br>ここへ外す</div>
      <div class="scan-boxes single"><div class="scan-cell single" data-label="${label}"><div class="inner-target"></div></div></div>
      <div class="side-block">隣の枠は<br>ここへ外す</div>
    </div>`;
  }else{
    overlay.innerHTML = `<div class="scan-boxes"><div class="scan-cell" data-label="百"></div><div class="scan-cell" data-label="十"></div><div class="scan-cell" data-label="一"></div></div>`;
  }
}

function captureSingleDigit(){
  const video=$('#cameraVideo'); const canvas=$('#captureCanvas');
  if(!video || !video.videoWidth){ return alert('カメラ映像がまだ準備できていません'); }
  const maxW=900; const scale=Math.min(1,maxW/video.videoWidth);
  canvas.width=Math.round(video.videoWidth*scale); canvas.height=Math.round(video.videoHeight*scale);
  const ctx=canvas.getContext('2d');
  ctx.drawImage(video,0,0,canvas.width,canvas.height);
  const boxes=getScanBoxes(canvas.width, canvas.height);
  const result=analyzeLineDigitCrop(canvas, boxes[0]);
  singleAnalysis[singleIndex]=result;
  if(result.digit!=='') singleDigits[singleIndex]=result.digit;
  drawScanGuide(ctx, boxes, canvas.width);
  lastSnapshotDataUrl=canvas.toDataURL('image/jpeg',0.86);

  const area=$('#snapshotArea'); area.classList.remove('hidden');
  const labels=['百の位','十の位','一の位'];
  const renderSingle=()=>{
    area.innerHTML=`<div class="card grid read-result-card">
      <b>${labels[singleIndex]}を読み取りました</b>
      <div class="display-code result-code">${singleDigits.map(x=>x===''?'-':x).join('')}</div>
      <div class="success">候補：${result.digit || '-'} / ${Math.round((result.confidence||0)*100)}%。違う場合は数字を選んでください。</div>
      <img class="crop-img large" src="${result.cropUrl}">
      <div class="muted">上位候補：${(result.alternatives||[]).map(a=>`${a.digit}:${Math.round(a.score*100)}%`).join(' / ')}</div>
      <div class="digit-select big-select">${[0,1,2,3,4,5,6,7,8,9].map(n=>`<button class="btn secondary small ${String(n)===String(singleDigits[singleIndex])?'active':''} ${String(n)===String(result.digit)?'candidate':''}" data-single-digit="${n}">${n}</button>`).join('')}</div>
      <div class="two"><button class="btn secondary" id="prevDigit">前の桁</button><button class="btn" id="nextDigit">次の桁へ</button></div>
      <button class="btn" id="searchSingle" ${singleDigits.some(x=>x==='')?'disabled':''}>3桁番号入力で確認</button>
      <details><summary>撮影画像を表示</summary><img class="snapshot" src="${lastSnapshotDataUrl}"></details>
      <button class="btn secondary" id="retakeSingle">この桁を撮り直す</button>
      <button class="btn secondary" onclick="stopCamera();nav('keypad')">3桁手入力へ</button>
    </div>`;
    $$('[data-single-digit]').forEach(b=>b.onclick=()=>{
      singleDigits[singleIndex]=b.dataset.singleDigit;
      // 修正したら次の桁へ。3桁そろったら3桁番号入力画面で最終確認。
      if(singleIndex<2){
        singleIndex++; updateScanOverlay(); area.classList.add('hidden'); area.innerHTML='';
        const s=$('#cameraStatus'); if(s) s.textContent=`${labels[singleIndex]}を中央の小枠に合わせて撮影してください。`;
      }else if(!singleDigits.some(x=>x==='')){
        goKeypadFromScan(singleDigits.join(''));
      }else{
        renderSingle();
      }
    });
    $('#retakeSingle').onclick=()=>{area.classList.add('hidden'); area.innerHTML='';};
    $('#prevDigit').onclick=()=>{singleIndex=Math.max(0,singleIndex-1); updateScanOverlay(); area.classList.add('hidden'); area.innerHTML=''; const s=$('#cameraStatus'); if(s) s.textContent=`${labels[singleIndex]}を中央枠に合わせて撮影してください。`;};
    $('#nextDigit').onclick=()=>{singleIndex=Math.min(2,singleIndex+1); updateScanOverlay(); area.classList.add('hidden'); area.innerHTML=''; const s=$('#cameraStatus'); if(s) s.textContent=`${labels[singleIndex]}を中央枠に合わせて撮影してください。`;};
    $('#searchSingle').onclick=()=>confirmSingleCode();
  };
  renderSingle();
  signalReadComplete();
  area.scrollIntoView({behavior:'smooth', block:'start'});
}
function confirmSingleCode(){
  if(singleDigits.some(x=>x==='')) return alert('3桁すべてを読み取るか選択してください');
  goKeypadFromScan(singleDigits.join(''));
}
function goKeypadFromScan(itemCode){
  saveRecognitionLog(singleAnalysis.map(x=>x||{digit:'',confidence:0,alternatives:[]}), itemCode, 'scan_corrected');
  stopCamera();
  nav('keypad',{prefill:itemCode, fromScan:true});
}

function captureLineDigits(){
  if(lineScanMode==='single') return captureSingleDigit();
  const video=$('#cameraVideo'); const canvas=$('#captureCanvas');
  if(!video || !video.videoWidth){ return alert('カメラ映像がまだ準備できていません'); }
  const maxW=900; const scale=Math.min(1,maxW/video.videoWidth);
  canvas.width=Math.round(video.videoWidth*scale); canvas.height=Math.round(video.videoHeight*scale);
  const ctx=canvas.getContext('2d');
  ctx.drawImage(video,0,0,canvas.width,canvas.height);

  // ガイド枠の位置。画面表示と同じ比率で、3つの枠を切り出す。
  const boxes = getScanBoxes(canvas.width, canvas.height);
  const analysis = analyzeLineDigitFrame(canvas, boxes);

  // 表示用にはガイド枠を重ねて描く。
  drawScanGuide(ctx, boxes, canvas.width);
  lastSnapshotDataUrl=canvas.toDataURL('image/jpeg',0.86);

  const area=$('#snapshotArea'); area.classList.remove('hidden');
  area.innerHTML=`<div class="card grid read-result-card">
    <b>読み取り結果</b>
    <div id="readCode" class="display-code result-code">---</div>
    <div class="success">読み取りました。番号を確認してから商品確認へ進んでください。</div>
    <button class="btn" id="searchShot">3桁番号入力で確認</button>
    <details><summary>撮影画像と桁ごとの修正を表示</summary><img class="snapshot" src="${lastSnapshotDataUrl}"><div id="digitRows" class="grid"></div></details>
    <button class="btn secondary" id="retake">撮り直す</button>
    <button class="btn secondary" onclick="stopCamera();nav('keypad')">3桁手入力へ</button>
  </div>`;

  let code=analysis.map(r=>r.digit || '');
  let pos=0;
  const labels=['百の位','十の位','一の位'];
  const renderChoice=()=>{
    $('#readCode').textContent=code.map(x=>x===''?'-':x).join('');
    $('#digitRows').innerHTML=analysis.map((r,i)=>`<div class="crop-row">
      <img class="crop-img" src="${r.cropUrl}">
      <div>
        <div class="row between"><b>${labels[i]}</b><span class="confidence">候補 ${r.digit ?? '-'} / ${Math.round((r.confidence||0)*100)}%</span></div>
        <div class="muted">上位候補：${(r.alternatives||[]).map(a=>`${a.digit}:${Math.round(a.score*100)}%`).join(' / ')}</div>
        <div class="digit-select">${[0,1,2,3,4,5,6,7,8,9].map(n=>`<button class="btn secondary small ${String(n)===String(code[i])?'active':''} ${String(n)===String(r.digit)?'candidate':''}" data-pos="${i}" data-digit="${n}">${n}</button>`).join('')}</div>
      </div>
    </div>`).join('');
    $$('[data-digit]').forEach(b=>b.onclick=()=>{ const i=Number(b.dataset.pos); code[i]=b.dataset.digit; pos=i; renderChoice(); });
  };
  $('#retake').onclick=()=>{area.classList.add('hidden'); area.innerHTML='';};
  $('#searchShot').onclick=()=>{
    if(code.some(x=>x==='')) return alert('3桁を選んでください');
    const itemCode=code.join('');
    saveRecognitionLog(analysis, itemCode, 'scan_corrected');
    stopCamera();
    nav('keypad',{prefill:itemCode, fromScan:true});
  };
  renderChoice();
  signalReadComplete();
  area.scrollIntoView({behavior:'smooth', block:'start'});
}

function getScanBoxes(w,h){
  if(lineScanMode==='single'){
    // Phase2-12: 1桁用は縦長すぎない短い枠にして、上下・隣の数字や外枠を拾わない。
    const cellW=Math.min(w*0.145, 86), cellH=Math.min(h*0.24, 150);
    const x=(w-cellW)/2, y=(h-cellH)/2;
    return [{x,y,w:cellW,h:cellH,label:['百','十','一'][singleIndex]}];
  }
  // 3桁一括は中央寄りにして外側の映り込みを減らす。精度確認用。
  const boxW=w*0.62, gap=w*0.065, cellW=(boxW-gap*2)/3, cellH=Math.min(h*0.25, 160);
  const startX=(w-boxW)/2, y=(h-cellH)/2;
  return [0,1,2].map(i=>({x:startX+i*(cellW+gap), y, w:cellW, h:cellH, label:['百','十','一'][i]}));
}
function drawScanGuide(ctx, boxes, w){
  ctx.strokeStyle='rgba(255,255,255,.95)'; ctx.lineWidth=Math.max(4,w*0.006);
  ctx.font=`bold ${Math.max(18,w*0.025)}px sans-serif`;
  boxes.forEach(b=>{ctx.strokeRect(b.x,b.y,b.w,b.h); ctx.fillStyle='rgba(0,0,0,.55)'; ctx.fillRect(b.x+8,b.y+8,46,28); ctx.fillStyle='#fff'; ctx.fillText(b.label,b.x+18,b.y+13);});
}
function analyzeLineDigitFrame(canvas, boxes){
  return boxes.map(box=>analyzeLineDigitCrop(canvas, box));
}
function analyzeLineDigitCrop(srcCanvas, box){
  const crop=document.createElement('canvas');
  crop.width=120; crop.height=150;
  const cctx=crop.getContext('2d');

  // 枠内の中心寄りを使う。手書きの外枠や余白の影響を減らす。
  const mx=box.w*(lineScanMode==='single'?0.10:0.14), my=box.h*(lineScanMode==='single'?0.12:0.14);
  cctx.drawImage(srcCanvas, box.x+mx, box.y+my, box.w-mx*2, box.h-my*2, 0,0,crop.width,crop.height);

  const rawMask=imageToMask(crop);
  const prepared=prepareDigitMask(rawMask);
  const scores=[];

  // 小さな中央ドットはテンプレート比較の前に0候補を強める。
  const dotScore=scoreCentralDot(rawMask);
  for(let d=0; d<=9; d++){
    const ds=String(d);
    let score;
    if(ds==='0'){
      score=Math.max(dotScore, scoreMaskAgainstTemplate(prepared, templateMask(ds, prepared.w, prepared.h))*0.72);
    }else{
      score=scoreMaskAgainstTemplate(prepared, templateMask(ds, prepared.w, prepared.h));
      score=Math.max(score, featureScore(prepared, ds));
    }
    scores.push({digit:ds, score});
  }

  scores.sort((a,b)=>b.score-a.score);
  const best=scores[0];
  const second=scores[1] || {score:0};
  const confidence=Math.max(0, Math.min(0.99, best.score));
  const cropUrl=crop.toDataURL('image/jpeg',0.86);

  // 低確信度でも候補を出す。半自動修正前提なので空欄にしすぎない。
  const digit = confidence>0.08 ? best.digit : '';
  return {digit, confidence, alternatives:scores.slice(0,3), cropUrl, margin:Math.round((best.score-second.score)*100)};
}

function imageToMask(canvas){
  const ctx=canvas.getContext('2d');
  const {width:w,height:h}=canvas;
  const img=ctx.getImageData(0,0,w,h).data;
  const lum=[];
  for(let i=0;i<img.length;i+=4){
    // 暗い線を抽出。屋外の影にもやや強くする。
    lum.push(img[i]*0.299+img[i+1]*0.587+img[i+2]*0.114);
  }
  const sorted=[...lum].sort((a,b)=>a-b);
  const p10=sorted[Math.floor(sorted.length*0.10)] || 40;
  const p30=sorted[Math.floor(sorted.length*0.30)] || 100;
  const p65=sorted[Math.floor(sorted.length*0.65)] || 180;
  const threshold=Math.min(178, Math.max(48, p10*0.45 + p30*0.35 + p65*0.20));
  let mask=new Uint8Array(w*h);
  for(let i=0;i<lum.length;i++) mask[i]=lum[i]<threshold ? 1 : 0;
  mask=removeTinyNoise(mask,w,h);
  mask=dilate(mask,w,h,1);
  return {w,h,mask};
}
function removeTinyNoise(mask,w,h){
  const out=new Uint8Array(mask.length);
  for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++){
    const idx=y*w+x; if(!mask[idx]) continue;
    let n=0; for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) n+=mask[(y+dy)*w+x+dx];
    if(n>=2) out[idx]=1;
  }
  return out;
}
function dilate(mask,w,h,r=1){
  const out=new Uint8Array(mask.length);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    let on=0; for(let dy=-r;dy<=r && !on;dy++) for(let dx=-r;dx<=r;dx++){
      const xx=x+dx, yy=y+dy; if(xx>=0&&yy>=0&&xx<w&&yy<h&&mask[yy*w+xx]){on=1; break}
    }
    out[y*w+x]=on;
  }
  return out;
}
function bboxOfMask(m){
  const {w,h,mask}=m; let minX=w,minY=h,maxX=-1,maxY=-1,count=0,sumX=0,sumY=0;
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) if(mask[y*w+x]){count++; sumX+=x; sumY+=y; if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;}
  return {minX,minY,maxX,maxY,count,cx:count?sumX/count:w/2,cy:count?sumY/count:h/2,width:maxX-minX+1,height:maxY-minY+1};
}
function prepareDigitMask(raw){
  const {w,h}=raw;
  let mask=raw.mask.slice();
  // 手書きの四角外枠を拾いやすい端の領域を削る。
  const edgeX=Math.round(w*0.12), edgeY=Math.round(h*0.10);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    if(x<edgeX || x>=w-edgeX || y<edgeY || y>=h-edgeY) mask[y*w+x]=0;
  }
  const b=bboxOfMask({w,h,mask});
  const nw=96, nh=128;
  const norm=new Uint8Array(nw*nh);
  if(!b.count) return {w:nw,h:nh,mask:norm};

  // 中央ドット用の小さな塊は、拡大しすぎない。
  if(b.width<w*0.28 && b.height<h*0.28 && b.count/(w*h)<0.055){
    const cx=Math.round(nw/2), cy=Math.round(nh/2);
    const r=Math.max(4, Math.round(Math.min(nw,nh)*0.07));
    for(let yy=cy-r; yy<=cy+r; yy++) for(let xx=cx-r; xx<=cx+r; xx++){
      if(xx>=0&&yy>=0&&xx<nw&&yy<nh && (xx-cx)**2+(yy-cy)**2<=r*r) norm[yy*nw+xx]=1;
    }
    return {w:nw,h:nh,mask:dilate(norm,nw,nh,1)};
  }

  const padX=Math.round(nw*0.13), padY=Math.round(nh*0.13);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) if(mask[y*w+x]){
    const nx=Math.round(padX + (x-b.minX)/Math.max(1,b.width-1)*(nw-padX*2-1));
    const ny=Math.round(padY + (y-b.minY)/Math.max(1,b.height-1)*(nh-padY*2-1));
    if(nx>=0&&ny>=0&&nx<nw&&ny<nh) norm[ny*nw+nx]=1;
  }
  return {w:nw,h:nh,mask:dilate(removeTinyNoise(norm,nw,nh),nw,nh,1)};
}
function scoreCentralDot(raw){
  const b=bboxOfMask(raw), {w,h}=raw;
  if(!b.count) return 0;
  const area=b.count/(w*h);
  const bw=b.width/w, bh=b.height/h;
  const centerDist=Math.hypot((b.cx/w)-0.5,(b.cy/h)-0.5);
  let s=0;
  if(area>0.002 && area<0.07) s+=0.42;
  if(bw<0.38 && bh<0.38) s+=0.32;
  if(centerDist<0.24) s+=0.30;
  return Math.max(0, Math.min(0.99, s));
}
const TEMPLATE_CACHE={};
function templateMask(d,w,h){
  const key=`${d}-${w}-${h}`; if(TEMPLATE_CACHE[key]) return TEMPLATE_CACHE[key];
  const c=document.createElement('canvas'); c.width=w; c.height=h;
  const ctx=c.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='#000'; ctx.fillStyle='#000'; ctx.lineWidth=Math.max(10, w*0.15); ctx.lineCap='round'; ctx.lineJoin='round';
  const X=p=>p*w, Y=p=>p*h;
  const line=(x1,y1,x2,y2)=>{ctx.beginPath(); ctx.moveTo(X(x1),Y(y1)); ctx.lineTo(X(x2),Y(y2)); ctx.stroke();};
  if(d==='0'){ctx.beginPath(); ctx.arc(X(.5),Y(.5),Math.max(7,w*.10),0,Math.PI*2); ctx.fill();}
  if(d==='1') line(.5,.15,.5,.85);
  if(d==='2') line(.15,.5,.85,.5);
  if(d==='3'){line(.5,.15,.5,.85); line(.15,.5,.85,.5);}
  if(d==='4') line(.18,.84,.82,.16);
  if(d==='5') line(.18,.16,.82,.84);
  if(d==='6'){line(.18,.16,.82,.84); line(.18,.84,.82,.16);}
  if(d==='7'){ctx.beginPath(); ctx.moveTo(X(.18),Y(.84)); ctx.lineTo(X(.5),Y(.16)); ctx.lineTo(X(.82),Y(.84)); ctx.stroke();}
  if(d==='8'){ctx.beginPath(); ctx.moveTo(X(.18),Y(.16)); ctx.lineTo(X(.5),Y(.84)); ctx.lineTo(X(.82),Y(.16)); ctx.stroke();}
  if(d==='9'){ctx.beginPath(); ctx.moveTo(X(.5),Y(.10)); ctx.lineTo(X(.86),Y(.5)); ctx.lineTo(X(.5),Y(.90)); ctx.lineTo(X(.14),Y(.5)); ctx.closePath(); ctx.stroke();}
  const m=imageToMask(c);
  return TEMPLATE_CACHE[key]=m;
}
function scoreMaskAgainstTemplate(sample, tmpl){
  const sm=sample.mask, tm=tmpl.mask;
  let inter=0, union=0, sCount=0, tCount=0;
  for(let i=0;i<sm.length;i++){
    if(sm[i]) sCount++; if(tm[i]) tCount++; if(sm[i]&&tm[i]) inter++; if(sm[i]||tm[i]) union++;
  }
  if(!sCount || !tCount) return 0;
  const jaccard=inter/(union||1);
  const coverage=inter/tCount;
  const sampleCoverage=inter/sCount;
  const densityPenalty=Math.max(0, (sCount/(sm.length||1))-0.30)*0.35;
  return Math.max(0, Math.min(0.99, jaccard*0.50 + coverage*0.32 + sampleCoverage*0.32 - densityPenalty));
}
function featureScore(m,d){
  const paths={
    '1':[[.5,.14,.5,.86]],
    '2':[[.14,.5,.86,.5]],
    '3':[[.5,.14,.5,.86],[.14,.5,.86,.5]],
    '4':[[.18,.84,.82,.16]],
    '5':[[.18,.16,.82,.84]],
    '6':[[.18,.16,.82,.84],[.18,.84,.82,.16]],
    '7':[[.18,.84,.5,.16],[.5,.16,.82,.84]],
    '8':[[.18,.16,.5,.84],[.5,.84,.82,.16]],
    '9':[[.5,.10,.86,.5],[.86,.5,.5,.90],[.5,.90,.14,.5],[.14,.5,.5,.10]],
  };
  const chosen=paths[d]; if(!chosen) return 0;
  let hit=0, pathPix=0, inkOnPath=0, inkTotal=0;
  const {w,h,mask}=m;
  const tol=Math.max(5, Math.round(w*0.07));
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    const on=!!mask[y*w+x]; if(on) inkTotal++;
    let near=false;
    for(const p of chosen){ if(distToSeg(x/w,y/h,p[0],p[1],p[2],p[3])*Math.max(w,h) <= tol){near=true; break;} }
    if(near){pathPix++; if(on) inkOnPath++;}
    if(on && near) hit++;
  }
  const cover=inkOnPath/(pathPix||1);
  const clean=hit/(inkTotal||1);
  return Math.max(0, Math.min(0.99, cover*0.55 + clean*0.45));
}
function distToSeg(px,py,x1,y1,x2,y2){
  const vx=x2-x1, vy=y2-y1, wx=px-x1, wy=py-y1;
  const c1=vx*wx+vy*wy, c2=vx*vx+vy*vy;
  let t=c2?c1/c2:0; t=Math.max(0,Math.min(1,t));
  const dx=px-(x1+t*vx), dy=py-(y1+t*vy);
  return Math.hypot(dx,dy);
}

function saveRecognitionLog(analysis, correctedCode, result){
  const autoCode = analysis.map(r=>r.digit || '-').join('');
  const log={
    id: uid(),
    created_at: nowIso(),
    auto_code: autoCode,
    corrected_code: correctedCode,
    result,
    confidences: analysis.map(r=>Math.round((r.confidence||0)*100)),
    alternatives: analysis.map(r=>(r.alternatives||[]).slice(0,3).map(a=>({digit:a.digit, score:Math.round(a.score*100)})))
  };
  state.recognition_logs = state.recognition_logs || [];
  state.recognition_logs.unshift(log);
  state.recognition_logs = state.recognition_logs.slice(0,200);
  save();
}
function recognitionLogs(v){
  setTitle('読み取りログ');
  const logs=state.recognition_logs||[];
  const mismatch=logs.filter(l=>l.auto_code!==l.corrected_code).length;
  const avg=logs.length?Math.round(logs.flatMap(l=>l.confidences||[]).reduce((a,b)=>a+b,0)/(logs.length*3)):0;
  v.innerHTML=`<div class="grid">
    <div class="card"><div class="muted">読み取り検証</div><div class="big-total">${logs.length}件</div><div class="muted">修正あり ${mismatch}件 / 平均確信度 ${avg}%</div></div>
    <div class="notice">ここに残るのは、撮影後に「この番号で商品確認」を押した記録です。誤読した数字の傾向確認に使います。</div>
    <div class="two"><button class="btn secondary" onclick="exportRecognitionLogs()">CSV書き出し</button><button class="btn danger" onclick="clearRecognitionLogs()">ログ削除</button></div>
    <div class="list">${logs.map(l=>`<div class="card"><div class="row between"><b>${l.corrected_code}</b><span class="badge ${l.auto_code===l.corrected_code?'selling':'sold'}">${l.auto_code===l.corrected_code?'一致':'修正あり'}</span></div><div class="muted">仮認識：${l.auto_code} / 結果：${l.result} / ${formatDt(l.created_at)}</div><div class="muted">確信度：${(l.confidences||[]).join('% / ')}%</div><details><summary>候補詳細</summary><pre>${JSON.stringify(l.alternatives,null,2)}</pre></details></div>`).join('') || '<div class="card muted">まだログはありません</div>'}</div>
  </div>`;
}
function exportRecognitionLogs(){
  const logs=state.recognition_logs||[];
  const header=['created_at','auto_code','corrected_code','result','confidences','alternatives'];
  const rows=logs.map(l=>[l.created_at,l.auto_code,l.corrected_code,l.result,(l.confidences||[]).join('/'),JSON.stringify(l.alternatives||[])]);
  const csv=[header,...rows].map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`recognition-logs-${todayKey()}.csv`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function clearRecognitionLogs(){ if(confirm('読み取りログを削除しますか？商品・売上データは削除されません。')){state.recognition_logs=[]; save(); render();} }

function keypad(v,{prefill='',fromScan=false}={}){setTitle('3桁番号入力'); v.innerHTML=`<div class="grid">${fromScan?'<div class="success">読み取り結果を入れました。違う場合はCで消して入力し直してください。</div>':''}<div id="display" class="display-code">---</div><div class="kbd">${[1,2,3,4,5,6,7,8,9].map(n=>`<button class="btn secondary" data-n="${n}">${n}</button>`).join('')}<button class="btn secondary" id="clear">C</button><button class="btn secondary" data-n="0">0</button><button class="btn secondary" id="del">←</button></div><button class="btn" id="search">検索</button><button class="btn secondary" onclick="nav('manualPrice')">番号がないので価格だけ追加</button></div>`; let val=String(prefill||'').replace(/\D/g,'').slice(-3); const upd=()=>$('#display').textContent=val?val.padStart(3,'0').slice(-3):'---'; $$('[data-n]').forEach(b=>b.onclick=()=>{if(val.length<3){val+=b.dataset.n; upd()}}); $('#clear').onclick=()=>{val=''; upd()}; $('#del').onclick=()=>{val=val.slice(0,-1); upd()}; $('#search').onclick=()=>{if(!val)return alert('番号を入力してください'); const code=val.padStart(3,'0').slice(-3); const item=state.items.find(i=>i.item_code===code && !i.deleted_at); if(!item) return nav('manualPrice',{missingCode:code}); if(item.status==='sold') return alert('この商品は販売済みです。通常はカートに追加できません。'); if(item.status!=='selling') return alert('この商品は販売対象外です。'); nav('confirmItem',{id:item.id})}; upd();}
function confirmItem(v,{id}){const item=state.items.find(i=>i.id===id); setTitle('商品確認'); if(!item){v.innerHTML='商品が見つかりません'; return} v.innerHTML=`<div class="grid card"><img class="hero-img" src="${item.image_uri}"><div class="code">${item.item_code}</div><h2>${itemName(item)}</h2><div class="big-total">${yen(item.price)}</div><span class="badge ${item.status}">${statusLabel(item.status)}</span><button class="btn" id="add">カートに追加</button><button class="btn secondary" onclick="nav('keypad')">手入力に戻る</button><button class="btn secondary" onclick="go('registerSale')">レジへ戻る</button></div>`; $('#add').onclick=()=>addItemToCart(item)}
function addItemToCart(item){ if(item.status!=='selling') return alert('販売中の商品だけ追加できます'); if(state.cart.some(c=>c.item_id===item.id)) return alert('この商品はすでにカートにあります'); state.cart.push({id:uid(), item_id:item.id, item_code:item.item_code, item_name:itemName(item), price:item.price, quantity:1, subtotal:item.price, line_type:'item', image_uri:item.image_uri, added_at:nowIso()}); save(); lastNotice=`${item.item_code} ${itemName(item)} をカートに追加しました。`; go('registerSale') }

function manualPrice(v,{missingCode}={}){setTitle('価格だけ追加'); const buttons=state.settings.quick_price_buttons||[]; v.innerHTML=`<div class="grid">${missingCode?`<div class="error">${missingCode} は未登録の商品番号です。価格だけ追加で会計できます。</div>`:''}<div class="card grid"><label>金額</label><input id="mp" type="number" min="1" inputmode="numeric" placeholder="例：500"><div class="three">${buttons.map(p=>`<button type="button" class="btn secondary small" data-price="${p}">${yen(p)}</button>`).join('')}</div><label>数量</label><div class="stepper"><button type="button" class="btn secondary small" id="minus">−</button><input id="qty" type="number" min="1" inputmode="numeric" value="1"><button type="button" class="btn secondary small" id="plus">＋</button></div><label>メモ</label><input id="memo" placeholder="例：値引き品"><button id="addManual" class="btn" type="button">カートに追加</button></div></div>`; $$('[data-price]').forEach(b=>b.onclick=()=>$('#mp').value=b.dataset.price); $('#minus').onclick=()=>{$('#qty').value=Math.max(1,Number($('#qty').value||1)-1)}; $('#plus').onclick=()=>{$('#qty').value=Number($('#qty').value||1)+1}; $('#addManual').onclick=()=>{const price=Number($('#mp').value), q=Number($('#qty').value||1); if(price<=0||q<=0)return alert('金額と数量を入力してください'); const name=$('#memo').value.trim()||'価格だけ追加'; state.cart.push({id:uid(), item_id:null, item_code:'MANUAL', item_name:name, price, quantity:q, subtotal:price*q, line_type:'manual_price', image_uri:null, added_at:nowIso()}); save(); lastNotice=`${name} ${yen(price*q)} をカートに追加しました。`; go('registerSale')};}

function cart(v){setTitle('カート'); v.innerHTML=`<div class="grid"><div class="card"><div class="muted">合計</div><div class="big-total">${yen(cartTotal())}</div></div><div class="list">${state.cart.map(cartRow).join('') || '<div class="card muted">カートは空です</div>'}</div><div class="two"><button class="btn secondary" onclick="nav('keypad')">続けて入力</button><button class="btn secondary" onclick="nav('manualPrice')">価格だけ追加</button></div><button class="btn danger" onclick="clearCart()">カート全消去</button></div>`; if(state.cart.length) footer(`<button class="btn ok" onclick="nav('receiptPreview')">支払いへ進む ${yen(cartTotal())}</button>`)}
function cartRow(c){const manual=c.line_type==='manual_price'; return `<div class="card"><div class="row between"><div><b>${c.item_code} ${c.item_name}</b><div class="muted">${yen(c.price)} × ${c.quantity}</div></div><div class="price">${yen(c.subtotal)}</div></div>${manual?`<div class="stepper mini"><button class="btn secondary small" onclick="changeQty('${c.id}',-1)">−</button><button class="btn secondary small" onclick="changeQty('${c.id}',1)">＋</button></div>`:''}<button class="btn secondary small" onclick="removeCart('${c.id}')">削除</button></div>`}
function changeQty(id,delta){const c=state.cart.find(x=>x.id===id); if(!c || c.line_type!=='manual_price') return; c.quantity=Math.max(1,c.quantity+delta); c.subtotal=c.price*c.quantity; save(); render()}
function removeCart(id){state.cart=state.cart.filter(c=>c.id!==id); save(); render()}
function clearCart(){ if(!state.cart.length) return; if(confirm('カートを空にしますか？未会計の商品は販売済みになりません。')){state.cart=[]; save(); render()} }

function receiptPreview(v){setTitle('支払い前明細'); if(!state.cart.length){v.innerHTML='<div class="card muted">カートが空です</div>'; return} v.innerHTML=`<div class="grid"><div class="card"><div class="muted">お支払い金額</div><div class="big-total">${yen(cartTotal())}</div></div><div class="card"><table><tbody>${state.cart.map(c=>`<tr><td>${c.item_code}<br>${c.item_name}</td><td class="right">${yen(c.price)} × ${c.quantity}<br><b>${yen(c.subtotal)}</b></td></tr>`).join('')}</tbody></table></div><button class="btn secondary" onclick="nav('cart')">カートに戻る</button></div>`; footer(`<button class="btn ok" onclick="nav('payment')">支払いへ進む</button>`)}
function payment(v){setTitle('決済サービス窓口'); const methods={square:'Square',paypay:'PayPay',rakuten_pay:'楽天ペイ',cash:'現金',other:'その他'}; const enabled=(state.settings.preferred_payment_methods||Object.keys(methods)).filter(k=>methods[k]); v.innerHTML=`<div class="grid"><div class="card"><div class="muted">合計金額</div><div class="big-total">${yen(cartTotal())}</div></div><div class="notice">外部決済が完了したら、この画面に戻って会計完了を押してください。完了前にアプリを閉じてもカートは残ります。</div><div class="card grid"><label>支払い方法</label><div class="seg wrap">${enabled.map(k=>`<button class="btn secondary small ${selectedPayment===k?'active':''}" data-pay="${k}">${methods[k]}</button>`).join('')}</div><button class="btn secondary" id="copy">金額をコピー</button><button class="btn secondary" id="openPay">決済サービスを開く</button><button class="btn ok" id="complete">会計完了</button><button class="btn secondary" onclick="nav('cart')">カートに戻る</button></div></div>`; $$('[data-pay]').forEach(b=>b.onclick=()=>{selectedPayment=b.dataset.pay; render()}); $('#copy').onclick=async()=>{try{await navigator.clipboard.writeText(String(cartTotal())); alert('金額をコピーしました')}catch(e){prompt('この金額をコピーしてください', String(cartTotal()))}}; $('#openPay').onclick=()=>openPayment(selectedPayment); $('#complete').onclick=()=>{if(confirm(`${paymentLabel(selectedPayment)}で${yen(cartTotal())}の会計を完了しますか？\n完了後、登録商品は販売済みになります。`)) completeSale();};}
function openPayment(m){ if(m==='cash'||m==='other') return alert('現金・その他は外部アプリを開かず記録します。'); alert('このテスト版では決済アプリの個別URLは未設定です。金額コピー後、普段使う決済アプリで決済してください。'); }
function completeSale(){ if(!state.cart.length) return alert('カートが空です'); for(const c of state.cart.filter(c=>c.line_type==='item')){const item=state.items.find(i=>i.id===c.item_id); if(!item || item.status!=='selling') return alert(`${c.item_code} は販売できない状態です。カートを確認してください。`)} const date=todayKey(); const count=state.sales.filter(s=>s.sale_no?.startsWith(date)).length+1; const soldAt=nowIso(); const sale={id:uid(), sale_no:`${date}-${String(count).padStart(4,'0')}`, sold_at:soldAt, total_amount:cartTotal(), payment_method:selectedPayment, status:'completed', receipt_image_uri:null, created_at:soldAt, updated_at:soldAt, sync_status:'pending_create', last_synced_at:null, items: state.cart.map(c=>({id:uid(), sale_id:null, item_id:c.item_id, item_code:c.item_code, item_name:c.item_name, price_at_sale:c.price, quantity:c.quantity, subtotal:c.subtotal, line_type:c.line_type, created_at:soldAt}))}; sale.items.forEach(x=>x.sale_id=sale.id); for(const c of state.cart.filter(c=>c.line_type==='item')){const item=state.items.find(i=>i.id===c.item_id); item.status='sold'; item.sold_at=sale.sold_at; item.updated_at=nowIso(); item.sync_status='pending_update'} state.sales.push(sale); state.cart=[]; save(); stack=[]; replace('saleDone',{id:sale.id}); }
function saleDone(v,{id}){const s=state.sales.find(x=>x.id===id); setTitle('会計完了'); if(!s){v.innerHTML='売上が見つかりません'; return} v.innerHTML=`<div class="grid"><div class="success">会計完了しました。カートは空になりました。</div><div class="card"><div class="muted">取引番号</div><div class="code">${s.sale_no}</div><div class="muted">${formatDt(s.sold_at)} / ${paymentLabel(s.payment_method)}</div><div class="big-total">${yen(s.total_amount)}</div><table><tbody>${s.items.map(i=>`<tr><td>${i.item_code}<br>${i.item_name}</td><td class="right">${yen(i.subtotal)}</td></tr>`).join('')}</tbody></table><div class="muted">${state.settings.receipt_message||''}</div></div><button class="btn" onclick="go('registerSale')">次の会計へ</button><button class="btn secondary" onclick="shareReceipt('${s.id}')">明細画像を共有</button><button class="btn secondary" onclick="go('sales')">売上履歴を見る</button></div>`}

function sales(v){setTitle('売上履歴'); const today=new Date().toDateString(); const completed=state.sales.filter(s=>s.status==='completed'); const canceled=state.sales.filter(s=>s.status==='canceled'); const todays=completed.filter(s=>new Date(s.sold_at).toDateString()===today); const total=todays.reduce((a,s)=>a+s.total_amount,0); const soldCount=state.items.filter(i=>i.status==='sold').length; const byPay=completed.reduce((m,s)=>{m[s.payment_method]=(m[s.payment_method]||0)+s.total_amount; return m},{}); v.innerHTML=`<div class="grid"><div class="card"><div class="muted">今日の売上</div><div class="big-total">${yen(total)}</div><div class="muted">今日の取引 ${todays.length}件 / 販売済み ${soldCount}点 / 取消 ${canceled.length}件</div><div class="muted">支払い別 ${Object.entries(byPay).map(([k,n])=>`${paymentLabel(k)}:${yen(n)}`).join(' / ')||'-'}</div></div><div class="list">${state.sales.slice().reverse().map(s=>`<div class="card ${s.status==='canceled'?'item sold':''}"><div class="row between"><b>${s.sale_no}</b><span class="badge ${s.status==='completed'?'selling':'sold'}">${s.status==='completed'?'完了':'取消'}</span></div><div class="row between"><span>${yen(s.total_amount)}</span><span class="muted">${formatDt(s.sold_at)} / ${paymentLabel(s.payment_method)} / ${s.items.length}件</span></div><details><summary>明細を見る</summary><table><tbody>${s.items.map(i=>`<tr><td>${i.item_code}<br>${i.item_name}</td><td class="right">${yen(i.subtotal)}</td></tr>`).join('')}</tbody></table><div class="two"><button class="btn secondary small" onclick="shareReceipt('${s.id}')">明細画像を共有</button>${s.status==='completed'?`<button class="btn danger small" onclick="cancelSale('${s.id}')">取引取消</button>`:''}</div></details></div>`).join('') || '<div class="card muted">売上履歴はありません</div>'}</div></div>`}

function cancelSale(id){
  const sale=state.sales.find(s=>s.id===id);
  if(!sale || sale.status!=='completed') return alert('取消できる取引が見つかりません');
  if(!confirm(`${sale.sale_no} を取り消しますか？
登録商品は販売中に戻します。`)) return;
  sale.status='canceled'; sale.updated_at=nowIso(); sale.sync_status='pending_update';
  for(const line of sale.items.filter(x=>x.line_type==='item')){
    const item=state.items.find(i=>i.id===line.item_id);
    if(item && item.status==='sold') { item.status='selling'; item.sold_at=null; item.updated_at=nowIso(); item.sync_status='pending_update'; }
  }
  save(); lastNotice='取引を取り消し、対象商品を販売中に戻しました。'; go('sales');
}

function settings(v){setTitle('設定'); v.innerHTML=`<form id="settingsForm" class="grid card"><label>店舗名</label><input id="shop" value="${state.settings.shop_name||''}"><label>よく使う価格ボタン（カンマ区切り）</label><input id="quick" value="${(state.settings.quick_price_buttons||[]).join(',')}"><label>商品番号の再利用</label><select id="reuse"><option value="false">再利用しない</option><option value="true">再利用する</option></select><label>通常数字読み取り</label><select id="normal"><option value="true">有効</option><option value="false">無効</option></select><label>レシート下部メッセージ</label><input id="msg" value="${state.settings.receipt_message||''}"><button class="btn" type="submit">保存</button><button class="btn secondary" type="button" onclick="go('recognitionLogs')">読み取りログを見る</button><button class="btn secondary" type="button" id="export">データを書き出し</button><label>バックアップ復元</label><input id="importFile" type="file" accept="application/json"><button class="btn secondary" type="button" id="importBtn">選択したJSONから復元</button><button class="btn danger" type="button" id="reset">全データ初期化</button></form>`; $('#reuse').value=String(!!state.settings.code_reuse_enabled); $('#normal').value=String(!!state.settings.normal_digit_reading_enabled); $('#settingsForm').onsubmit=e=>{e.preventDefault(); state.settings.shop_name=$('#shop').value; state.settings.quick_price_buttons=$('#quick').value.split(',').map(x=>Number(x.trim())).filter(Boolean); state.settings.code_reuse_enabled=$('#reuse').value==='true'; state.settings.normal_digit_reading_enabled=$('#normal').value==='true'; state.settings.receipt_message=$('#msg').value; save(); alert('保存しました')}; $('#export').onclick=exportData; $('#importBtn').onclick=importData; $('#reset').onclick=()=>{if(confirm('全データを削除します。よろしいですか？')){state=defaultState(); save(); go('home')}};}
function exportData(){const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`sen-digit-register-backup-${todayKey()}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function importData(){
  const file=$('#importFile')?.files?.[0];
  if(!file) return alert('復元するJSONファイルを選んでください');
  const r=new FileReader();
  r.onload=()=>{try{ const data=JSON.parse(r.result); if(!data || !Array.isArray(data.items) || !Array.isArray(data.sales)) throw new Error('形式が違います'); if(!confirm('現在の端末内データをバックアップ内容で置き換えます。よろしいですか？')) return; state={...defaultState(), ...data, settings:{...defaultState().settings, ...(data.settings||{})}}; save(); lastNotice='バックアップから復元しました。'; go('home'); }catch(e){ alert('復元できませんでした。JSONファイルを確認してください。'); }};
  r.readAsText(file);
}



function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight){
  const words = String(text||'').split('');
  let line='';
  for(const ch of words){
    const test=line+ch;
    if(ctx.measureText(test).width > maxWidth && line){ ctx.fillText(line,x,y); y+=lineHeight; line=ch; }
    else line=test;
  }
  if(line){ ctx.fillText(line,x,y); y+=lineHeight; }
  return y;
}
function receiptCanvas(sale){
  const w=900, pad=64, rowH=54;
  const h=Math.max(900, 560 + sale.items.length*rowH);
  const c=document.createElement('canvas'); c.width=w; c.height=h;
  const ctx=c.getContext('2d');
  ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,w,h);
  ctx.fillStyle='#111827'; ctx.textBaseline='top'; ctx.textAlign='center';
  ctx.font='bold 42px -apple-system, BlinkMacSystemFont, sans-serif';
  let y=50;
  const shop=(state.settings.shop_name||'線数字レジ').trim() || '線数字レジ';
  ctx.fillText(shop, w/2, y); y+=58;
  ctx.font='bold 34px -apple-system, BlinkMacSystemFont, sans-serif'; ctx.fillText('お買い上げ明細', w/2, y); y+=60;
  ctx.textAlign='left'; ctx.font='26px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(`取引番号：${sale.sale_no}`, pad, y); y+=38;
  ctx.fillText(`日時：${new Date(sale.sold_at).toLocaleString('ja-JP')}`, pad, y); y+=38;
  ctx.fillText(`支払い：${paymentLabel(sale.payment_method)}`, pad, y); y+=44;
  ctx.strokeStyle='#d1d5db'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(pad,y); ctx.lineTo(w-pad,y); ctx.stroke(); y+=24;
  ctx.font='bold 28px -apple-system, BlinkMacSystemFont, sans-serif'; ctx.fillText('商品', pad, y); ctx.textAlign='right'; ctx.fillText('小計', w-pad, y); y+=42;
  ctx.font='25px -apple-system, BlinkMacSystemFont, sans-serif';
  for(const item of sale.items){
    ctx.textAlign='left';
    const name=`${item.item_code} ${item.item_name}  ${yen(item.price_at_sale)} × ${item.quantity}`;
    const before=y;
    y=drawWrappedText(ctx, name, pad, y, 560, 32);
    ctx.textAlign='right'; ctx.fillText(yen(item.subtotal), w-pad, before);
    y=Math.max(y,before+rowH);
  }
  y+=10; ctx.beginPath(); ctx.moveTo(pad,y); ctx.lineTo(w-pad,y); ctx.stroke(); y+=30;
  ctx.font='bold 42px -apple-system, BlinkMacSystemFont, sans-serif'; ctx.textAlign='left'; ctx.fillText('合計', pad, y); ctx.textAlign='right'; ctx.fillText(yen(sale.total_amount), w-pad, y); y+=82;
  ctx.font='26px -apple-system, BlinkMacSystemFont, sans-serif'; ctx.textAlign='center';
  const msg=state.settings.receipt_message || 'ありがとうございました';
  drawWrappedText(ctx, msg, pad, y, w-pad*2, 34);
  return c;
}
function canvasToBlob(canvas){return new Promise(resolve=>canvas.toBlob(resolve,'image/png',0.95));}
async function shareReceipt(id){
  const sale=state.sales.find(s=>s.id===id);
  if(!sale) return alert('売上が見つかりません');
  const canvas=receiptCanvas(sale);
  const blob=await canvasToBlob(canvas);
  const filename=`receipt-${sale.sale_no}.png`;
  const file=new File([blob], filename, {type:'image/png'});
  try{
    if(navigator.canShare && navigator.canShare({files:[file]})){
      await navigator.share({files:[file], title:'お買い上げ明細', text:`${sale.sale_no} ${yen(sale.total_amount)}`});
    }else{
      const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1500);
      alert('明細画像を作成しました。共有メニューが使えない環境では画像をダウンロードします。');
    }
  }catch(e){
    if(e && e.name === 'AbortError') return;
    const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
}

window.addEventListener('beforeunload', e=>{ if(state.cart.length){ e.preventDefault(); e.returnValue='未完了のカートがあります'; }});
window.exportRecognitionLogs=exportRecognitionLogs; window.clearRecognitionLogs=clearRecognitionLogs; window.cancelSale=cancelSale; window.importData=importData; window.stopCamera=stopCamera; window.nav=nav; window.replace=replace; window.go=go; window.removeCart=removeCart; window.clearCart=clearCart; window.changeQty=changeQty; window.shareReceipt=shareReceipt; render();

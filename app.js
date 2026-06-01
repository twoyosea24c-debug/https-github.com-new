const KEY = 'lineDigitRegisterMvp.v1';
const $ = (s)=>document.querySelector(s);
const yen = (n)=>'¥'+Number(n||0).toLocaleString('ja-JP');
const nowIso = ()=>new Date().toISOString();
const todayKey = ()=>new Date().toISOString().slice(0,10).replaceAll('-','');
const uid = ()=>crypto.randomUUID ? crypto.randomUUID() : String(Date.now())+Math.random();
let state = load();
let route = {name:'home'};
let stack = [];
let selectedPayment = 'paypay';

function defaultState(){return {items:[], cart:[], sales:[], settings:{shop_name:'', code_reuse_enabled:false, normal_digit_reading_enabled:true, preferred_payment_methods:['square','paypay','rakuten_pay','cash','other'], quick_price_buttons:[500,800,1000,1200,1500,2000], receipt_message:'ありがとうございました'}}}
function load(){try{return {...defaultState(), ...(JSON.parse(localStorage.getItem(KEY))||{})}}catch(e){return defaultState()}}
function save(){localStorage.setItem(KEY, JSON.stringify(state))}
function setTitle(t){$('#title').textContent=t; $('#backBtn').classList.toggle('hidden', stack.length===0)}
function nav(name, params={}){stack.push(route); route={name, params}; render()}
function replace(name, params={}){route={name, params}; render()}
function back(){ if(stack.length){ route=stack.pop(); render(); } }
$('#backBtn').onclick=back;
function footer(html){ const f=$('#footer'); if(!html){f.classList.add('hidden'); f.innerHTML=''; return} f.classList.remove('hidden'); f.innerHTML=html; }
function formatDt(iso){ if(!iso) return '-'; const d=new Date(iso); return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`}
function itemName(item){return item.name || `商品 ${item.item_code}`}
function statusLabel(s){return s==='selling'?'販売中':s==='sold'?'販売済み':'非表示'}
function nextItemCode(){
  const used = new Set(state.items.filter(i=>!state.settings.code_reuse_enabled || i.code_reuse_blocked !== false).map(i=>i.item_code));
  for(let n=1;n<=999;n++){const c=String(n).padStart(3,'0'); if(!used.has(c)) return c}
  throw new Error('商品番号が999まで埋まっています')
}
function cartTotal(){return state.cart.reduce((s,x)=>s+x.subtotal,0)}
function activeItems(){return state.items.filter(i=>!i.deleted_at)}
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

function render(){
  const v=$('#view'); footer(null);
  const pages={home, register, registered, items, registerSale, keypad, confirmItem, manualPrice, cart, receiptPreview, payment, saleDone, sales, settings};
  (pages[route.name]||home)(v, route.params||{});
}
function home(v){setTitle('線数字レジ MVP'); v.innerHTML=`<div class="grid">
  <div class="card"><div class="muted">現在のカート</div><div class="big-total">${yen(cartTotal())}</div><div class="muted">${state.cart.length}件の商品</div></div>
  <button class="btn" onclick="nav('registerSale')">レジを開く</button>
  <button class="btn secondary" onclick="nav('register')">商品登録</button>
  <button class="btn secondary" onclick="nav('items')">商品一覧</button>
  <button class="btn secondary" onclick="nav('sales')">売上履歴</button>
  <button class="btn secondary" onclick="nav('settings')">設定</button>
  <div class="notice">この版は実用テスト用のフェーズ1です。線数字のカメラ自動読み取りは次フェーズで追加します。</div>
</div>`}
function register(v){setTitle('商品登録'); v.innerHTML=`<form id="regForm" class="grid card">
  <label>商品写真（必須）</label><input id="photo" type="file" accept="image/*" capture="environment" required><img id="preview" class="hero-img hidden" alt="preview">
  <label>価格（必須）</label><input id="price" type="number" min="1" inputmode="numeric" required placeholder="例：2500">
  <label>商品名（任意）</label><input id="name" placeholder="例：陶器ブローチ">
  <label>カテゴリ（任意）</label><input id="category" placeholder="例：アクセサリー">
  <label>メモ（任意）</label><textarea id="memo"></textarea>
  <button class="btn" type="submit">登録する</button>
</form>`;
  let image=''; $('#photo').onchange=e=>{const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=()=>{image=r.result; $('#preview').src=image; $('#preview').classList.remove('hidden')}; r.readAsDataURL(f)};
  $('#regForm').onsubmit=e=>{e.preventDefault(); try{ const code=nextItemCode(); const item={id:uid(), item_code:code, name:$('#name').value.trim()||`商品 ${code}`, price:Number($('#price').value), image_uri:image, category:$('#category').value.trim(), memo:$('#memo').value.trim(), status:'selling', created_at:nowIso(), updated_at:nowIso(), sold_at:null, deleted_at:null, code_reuse_blocked:true, sync_status:'pending_create', last_synced_at:null}; if(!image) return alert('商品写真を登録してください'); if(item.price<=0) return alert('価格を入力してください'); state.items.push(item); save(); nav('registered',{id:item.id}); }catch(err){alert(err.message)} };
}
function registered(v,{id}){const item=state.items.find(i=>i.id===id); setTitle('登録完了'); if(!item){v.innerHTML='商品が見つかりません'; return} v.innerHTML=`<div class="grid">
  <div class="success">登録しました。このコードを商品ラベルに書いてください。</div>
  <div class="card grid"><img class="hero-img" src="${item.image_uri}"><div class="code">${item.item_code}</div><div class="price">${yen(item.price)}</div><div>${itemName(item)}</div>${lineCode(item.item_code)}</div>
  <button class="btn" onclick="replace('register')">次の商品を登録</button><button class="btn secondary" onclick="replace('items')">商品一覧へ</button><button class="btn secondary" onclick="replace('registerSale')">レジへ</button>
</div>`}
function items(v){setTitle('商品一覧'); const q=route.params?.q||''; const st=route.params?.st||'all'; let list=activeItems().filter(i=>(st==='all'||i.status===st) && (`${i.item_code} ${itemName(i)} ${i.category}`.includes(q))); v.innerHTML=`<div class="grid">
  <div class="card grid"><input id="q" placeholder="商品番号・商品名で検索" value="${q}"><select id="st"><option value="all">すべて</option><option value="selling">販売中</option><option value="sold">販売済み</option><option value="hidden">非表示</option></select></div>
  <div class="list">${list.map(itemCard).join('') || '<div class="card muted">商品がありません</div>'}</div>
</div>`; $('#st').value=st; $('#q').oninput=e=>replace('items',{q:e.target.value, st:$('#st').value}); $('#st').onchange=e=>replace('items',{q:$('#q').value, st:e.target.value});}
function itemCard(i){return `<div class="card item ${i.status}"><div class="row"><img class="thumb" src="${i.image_uri||''}"><div style="flex:1"><div class="row between"><b>${i.item_code} ${itemName(i)}</b><span class="badge ${i.status}">${statusLabel(i.status)}</span></div><div class="price">${yen(i.price)}</div><div class="muted">登録 ${formatDt(i.created_at)} / 販売 ${formatDt(i.sold_at)}</div>${lineCode(i.item_code,'small')}</div></div></div>`}
function registerSale(v){setTitle('レジ'); v.innerHTML=`<div class="grid">
  <div class="card"><div class="muted">合計</div><div class="big-total">${yen(cartTotal())}</div><div class="muted">カート ${state.cart.length}件</div></div>
  <button class="btn" onclick="nav('keypad')">3桁番号を入力</button>
  <button class="btn secondary" onclick="nav('manualPrice')">価格だけ追加</button>
  <button class="btn secondary" onclick="alert('線数字カメラ読み取りは次フェーズで実装します。まずは3桁手入力で現場テストしてください。')">線数字を読む（次フェーズ）</button>
  <button class="btn secondary" onclick="alert('通常数字読み取りは次フェーズで実装します。')">通常数字を読む（次フェーズ）</button>
  <button class="btn secondary" onclick="nav('cart')">カートを見る</button>
</div>`; if(state.cart.length) footer(`<button class="btn ok" onclick="nav('receiptPreview')">支払いへ進む ${yen(cartTotal())}</button>`)}
function keypad(v){setTitle('3桁番号入力'); v.innerHTML=`<div class="grid"><div id="display" class="display-code">---</div><div class="kbd">${[1,2,3,4,5,6,7,8,9].map(n=>`<button class="btn secondary" data-n="${n}">${n}</button>`).join('')}<button class="btn secondary" id="clear">C</button><button class="btn secondary" data-n="0">0</button><button class="btn secondary" id="del">←</button></div><button class="btn" id="search">検索</button></div>`; let val=''; const upd=()=>$('#display').textContent=val?val.padStart(3,'0').slice(-3):'---'; document.querySelectorAll('[data-n]').forEach(b=>b.onclick=()=>{if(val.length<3){val+=b.dataset.n; upd()}}); $('#clear').onclick=()=>{val=''; upd()}; $('#del').onclick=()=>{val=val.slice(0,-1); upd()}; $('#search').onclick=()=>{if(!val)return alert('番号を入力してください'); const code=val.padStart(3,'0').slice(-3); const item=state.items.find(i=>i.item_code===code && !i.deleted_at); if(!item) return nav('manualPrice',{missingCode:code}); if(item.status==='sold') return alert('この商品は販売済みです。通常はカートに追加できません。'); if(item.status!=='selling') return alert('この商品は販売対象外です。'); nav('confirmItem',{id:item.id})};}
function confirmItem(v,{id}){const item=state.items.find(i=>i.id===id); setTitle('商品確認'); if(!item){v.innerHTML='商品が見つかりません'; return} v.innerHTML=`<div class="grid card"><img class="hero-img" src="${item.image_uri}"><div class="code">${item.item_code}</div><h2>${itemName(item)}</h2><div class="big-total">${yen(item.price)}</div><span class="badge ${item.status}">${statusLabel(item.status)}</span><button class="btn" id="add">カートに追加</button><button class="btn secondary" onclick="nav('keypad')">手入力に戻る</button></div>`; $('#add').onclick=()=>addItemToCart(item)}
function addItemToCart(item){ if(item.status!=='selling') return alert('販売中の商品だけ追加できます'); if(state.cart.some(c=>c.item_id===item.id)) return alert('この商品はすでにカートにあります'); state.cart.push({id:uid(), item_id:item.id, item_code:item.item_code, item_name:itemName(item), price:item.price, quantity:1, subtotal:item.price, line_type:'item', image_uri:item.image_uri, added_at:nowIso()}); save(); replace('registerSale') }
function manualPrice(v,{missingCode}={}){setTitle('価格だけ追加'); const buttons=state.settings.quick_price_buttons||[]; v.innerHTML=`<div class="grid">${missingCode?`<div class="error">${missingCode} は未登録の商品番号です。</div>`:''}<div class="card grid"><label>金額</label><input id="mp" type="number" min="1" inputmode="numeric" placeholder="例：500"><div class="three">${buttons.map(p=>`<button class="btn secondary small" data-price="${p}">${yen(p)}</button>`).join('')}</div><label>数量</label><input id="qty" type="number" min="1" inputmode="numeric" value="1"><label>メモ</label><input id="memo" placeholder="例：値引き品"><button id="addManual" class="btn">カートに追加</button></div></div>`; document.querySelectorAll('[data-price]').forEach(b=>b.onclick=()=>$('#mp').value=b.dataset.price); $('#addManual').onclick=()=>{const price=Number($('#mp').value), q=Number($('#qty').value||1); if(price<=0||q<=0)return alert('金額と数量を入力してください'); state.cart.push({id:uid(), item_id:null, item_code:'MANUAL', item_name:$('#memo').value.trim()||'価格だけ追加', price, quantity:q, subtotal:price*q, line_type:'manual_price', image_uri:null, added_at:nowIso()}); save(); replace('registerSale')};}
function cart(v){setTitle('カート'); v.innerHTML=`<div class="grid"><div class="card"><div class="muted">合計</div><div class="big-total">${yen(cartTotal())}</div></div><div class="list">${state.cart.map(cartRow).join('') || '<div class="card muted">カートは空です</div>'}</div><button class="btn secondary" onclick="nav('manualPrice')">価格だけ追加</button><button class="btn danger" onclick="clearCart()">カート全消去</button></div>`; if(state.cart.length) footer(`<button class="btn ok" onclick="nav('receiptPreview')">支払いへ進む ${yen(cartTotal())}</button>`)}
function cartRow(c){return `<div class="card"><div class="row between"><div><b>${c.item_code} ${c.item_name}</b><div class="muted">${yen(c.price)} × ${c.quantity}</div></div><div class="price">${yen(c.subtotal)}</div></div><button class="btn secondary small" onclick="removeCart('${c.id}')">削除</button></div>`}
function removeCart(id){state.cart=state.cart.filter(c=>c.id!==id); save(); render()}
function clearCart(){ if(confirm('カートを空にしますか？')){state.cart=[]; save(); render()} }
function receiptPreview(v){setTitle('支払い前明細'); v.innerHTML=`<div class="grid"><div class="card"><div class="muted">お支払い金額</div><div class="big-total">${yen(cartTotal())}</div></div><div class="card"><table><tbody>${state.cart.map(c=>`<tr><td>${c.item_code}<br>${c.item_name}</td><td class="right">${yen(c.price)} × ${c.quantity}<br><b>${yen(c.subtotal)}</b></td></tr>`).join('')}</tbody></table></div><button class="btn secondary" onclick="nav('cart')">カートに戻る</button></div>`; footer(`<button class="btn ok" onclick="nav('payment')">支払いへ進む</button>`)}
function payment(v){setTitle('決済サービス窓口'); const methods={square:'Square',paypay:'PayPay',rakuten_pay:'楽天ペイ',cash:'現金',other:'その他'}; v.innerHTML=`<div class="grid"><div class="card"><div class="muted">合計金額</div><div class="big-total">${yen(cartTotal())}</div></div><div class="notice">外部決済が完了したら、この画面に戻って会計完了を押してください。</div><div class="card grid"><label>支払い方法</label><div class="seg wrap">${Object.entries(methods).map(([k,n])=>`<button class="btn secondary small ${selectedPayment===k?'active':''}" data-pay="${k}">${n}</button>`).join('')}</div><button class="btn secondary" id="copy">金額をコピー</button><button class="btn secondary" id="openPay">決済サービスを開く</button><button class="btn ok" id="complete">会計完了</button><button class="btn secondary" onclick="nav('cart')">カートに戻る</button></div></div>`; document.querySelectorAll('[data-pay]').forEach(b=>b.onclick=()=>{selectedPayment=b.dataset.pay; render()}); $('#copy').onclick=async()=>{try{await navigator.clipboard.writeText(String(cartTotal())); alert('金額をコピーしました')}catch(e){prompt('この金額をコピーしてください', String(cartTotal()))}}; $('#openPay').onclick=()=>openPayment(selectedPayment); $('#complete').onclick=completeSale;}
function openPayment(m){ if(m==='cash'||m==='other') return alert('現金・その他は外部アプリを開かず記録します。'); alert('このテスト版では決済アプリの個別URLは未設定です。金額コピー後、普段使う決済アプリで決済してください。'); }
function completeSale(){ if(!state.cart.length) return alert('カートが空です'); for(const c of state.cart.filter(c=>c.line_type==='item')){const item=state.items.find(i=>i.id===c.item_id); if(!item || item.status!=='selling') return alert(`${c.item_code} は販売できない状態です。カートを確認してください。`)} const date=todayKey(); const count=state.sales.filter(s=>s.sale_no?.startsWith(date)).length+1; const sale={id:uid(), sale_no:`${date}-${String(count).padStart(4,'0')}`, sold_at:nowIso(), total_amount:cartTotal(), payment_method:selectedPayment, status:'completed', receipt_image_uri:null, created_at:nowIso(), updated_at:nowIso(), sync_status:'pending_create', last_synced_at:null, items: state.cart.map(c=>({id:uid(), sale_id:null, item_id:c.item_id, item_code:c.item_code, item_name:c.item_name, price_at_sale:c.price, quantity:c.quantity, subtotal:c.subtotal, line_type:c.line_type, created_at:nowIso()}))}; sale.items.forEach(x=>x.sale_id=sale.id); for(const c of state.cart.filter(c=>c.line_type==='item')){const item=state.items.find(i=>i.id===c.item_id); item.status='sold'; item.sold_at=sale.sold_at; item.updated_at=nowIso(); item.sync_status='pending_update'} state.sales.push(sale); state.cart=[]; save(); replace('saleDone',{id:sale.id}); }
function saleDone(v,{id}){const s=state.sales.find(x=>x.id===id); setTitle('会計完了'); if(!s){v.innerHTML='売上が見つかりません'; return} v.innerHTML=`<div class="grid"><div class="success">会計完了しました</div><div class="card"><div class="muted">取引番号</div><div class="code">${s.sale_no}</div><div class="muted">${formatDt(s.sold_at)} / ${s.payment_method}</div><div class="big-total">${yen(s.total_amount)}</div><table><tbody>${s.items.map(i=>`<tr><td>${i.item_code}<br>${i.item_name}</td><td class="right">${yen(i.subtotal)}</td></tr>`).join('')}</tbody></table></div><button class="btn" onclick="replace('registerSale')">次の会計へ</button><button class="btn secondary" onclick="replace('sales')">売上履歴を見る</button><button class="btn secondary" onclick="alert('明細画像共有は次フェーズで実装します。')">明細画像を共有（次フェーズ）</button></div>`}
function sales(v){setTitle('売上履歴'); const today=new Date().toDateString(); const completed=state.sales.filter(s=>s.status==='completed'); const todays=completed.filter(s=>new Date(s.sold_at).toDateString()===today); const total=todays.reduce((a,s)=>a+s.total_amount,0); const soldCount=state.items.filter(i=>i.status==='sold').length; const byPay=completed.reduce((m,s)=>{m[s.payment_method]=(m[s.payment_method]||0)+s.total_amount; return m},{}); v.innerHTML=`<div class="grid"><div class="card"><div class="muted">今日の売上</div><div class="big-total">${yen(total)}</div><div class="muted">今日の取引 ${todays.length}件 / 販売済み ${soldCount}点</div><div class="muted">支払い別 ${Object.entries(byPay).map(([k,n])=>`${k}:${yen(n)}`).join(' / ')||'-'}</div></div><div class="list">${completed.slice().reverse().map(s=>`<div class="card"><div class="row between"><b>${s.sale_no}</b><span>${yen(s.total_amount)}</span></div><div class="muted">${formatDt(s.sold_at)} / ${s.payment_method} / ${s.items.length}件</div><details><summary>明細を見る</summary><table><tbody>${s.items.map(i=>`<tr><td>${i.item_code}<br>${i.item_name}</td><td class="right">${yen(i.subtotal)}</td></tr>`).join('')}</tbody></table></details></div>`).join('') || '<div class="card muted">売上履歴はありません</div>'}</div></div>`}
function settings(v){setTitle('設定'); v.innerHTML=`<form id="settingsForm" class="grid card"><label>店舗名</label><input id="shop" value="${state.settings.shop_name||''}"><label>よく使う価格ボタン（カンマ区切り）</label><input id="quick" value="${(state.settings.quick_price_buttons||[]).join(',')}"><label>商品番号の再利用</label><select id="reuse"><option value="false">再利用しない</option><option value="true">再利用する</option></select><label>通常数字読み取り</label><select id="normal"><option value="true">有効</option><option value="false">無効</option></select><label>レシート下部メッセージ</label><input id="msg" value="${state.settings.receipt_message||''}"><button class="btn" type="submit">保存</button><button class="btn danger" type="button" id="reset">全データ初期化</button></form>`; $('#reuse').value=String(!!state.settings.code_reuse_enabled); $('#normal').value=String(!!state.settings.normal_digit_reading_enabled); $('#settingsForm').onsubmit=e=>{e.preventDefault(); state.settings.shop_name=$('#shop').value; state.settings.quick_price_buttons=$('#quick').value.split(',').map(x=>Number(x.trim())).filter(Boolean); state.settings.code_reuse_enabled=$('#reuse').value==='true'; state.settings.normal_digit_reading_enabled=$('#normal').value==='true'; state.settings.receipt_message=$('#msg').value; save(); alert('保存しました')}; $('#reset').onclick=()=>{if(confirm('全データを削除します。よろしいですか？')){state=defaultState(); save(); replace('home')}};}
window.nav=nav; window.replace=replace; window.removeCart=removeCart; window.clearCart=clearCart; render();

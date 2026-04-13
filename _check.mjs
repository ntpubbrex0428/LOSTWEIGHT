
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged, browserLocalPersistence, setPersistence, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, get, set, update, push, remove, onValue, off } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDxlXH49702EDjz9MQ0hvyu7ThUhkysVFM",
  authDomain: "lose-weight-3ae05.firebaseapp.com",
  databaseURL: "https://lose-weight-3ae05-default-rtdb.asia-southeast1.firebasedatabase.app/",
  projectId: "lose-weight-3ae05",
  storageBucket: "lose-weight-3ae05.firebasestorage.app",
  messagingSenderId: "902388908827",
  appId: "1:902388908827:web:9e782ac0a61107464449be"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

const menus = [
  [{name:'超商版',items:['茶葉蛋 2 顆','無糖豆漿 1 瓶','雞胸肉 1 份','地瓜 1 條'],kcal:650},
   {name:'便當版',items:['雞腿便當去皮','白飯半碗','青菜加量','滷豆腐'],kcal:750}],
  [{name:'火鍋版',items:['牛肉或雞肉','菜盤多吃','冬粉半份','無糖茶'],kcal:700},
   {name:'早餐店版',items:['鮪魚蛋吐司','無糖豆漿','茶葉蛋 1 顆'],kcal:600}],
  [{name:'自助餐版',items:['兩份青菜','一份雞肉','一份蛋','飯半碗'],kcal:700},
   {name:'麵店版',items:['乾麵小碗','燙青菜','滷蛋','豆干'],kcal:720}]
];

let currentUser = null;
let currentProfile = null;
let socialGroupRef = null;
let friendsRef = null;
let friendRequestsRef = null;
let privateChatRef = null;
let currentChatMode = 'group';
let activeFriendUid = '';
let cachedFriendsMap = {};
let unreadGroupCount = 0;
let unreadPrivateCount = 0;
let groupLastSeenTime = 0;
let privateLastSeenMap = {};
window.__groupMembersCache = window.__groupMembersCache || {};
let currentPage = 'page-login';
let lastFoodAi = null;
let mealEntries = [];
let drinkEntries = [];
let editingMealIndex = -1;
let editingDrinkIndex = -1;
let activeGroupIndex = 0;
const FOOD_AI_ENDPOINT = '/.netlify/functions/food-analyze';
const PLAN_AI_ENDPOINT = '/.netlify/functions/plan-advice';
const TEXT_CALORIE_ENDPOINT = '/.netlify/functions/text-calorie';
const MENU_AI_ENDPOINT = '/.netlify/functions/menu-recommend';

const qs = (id)=>document.getElementById(id);
const today = ()=>new Date().toISOString().slice(0,10);

function showPage(id){
  if(!currentUser && id !== 'page-login') id = 'page-login';
  document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
  qs(id).classList.add('active');
  currentPage = id;
}
window.showPage = showPage;

function renderLoginView(mode='auth'){
  const isProfile = mode === 'profile' && !!currentUser;
  qs('loginTitle').textContent = isProfile ? '👤 修改暱稱' : '👤 註冊 / 登入';
  qs('nicknameWrap').style.display = isProfile ? 'block' : 'none';
  qs('authFieldsWrap').style.display = isProfile ? 'none' : 'block';
  qs('profileActionRow').style.display = isProfile ? 'grid' : 'none';
  qs('logoutBtn').style.display = isProfile ? 'block' : 'none';
  qs('backBtn').style.display = isProfile ? 'block' : 'none';
  if(isProfile){
    qs('nicknameInput').value = currentProfile?.nickname || '';
    qs('loginStatus').textContent = '目前已登入，可直接修改暱稱';
  } else {
    qs('loginStatus').textContent = currentUser ? '目前已登入' : '尚未登入';
  }
}

function escapeHtml(v=''){ return String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;'); }
function debug(msg){ qs('loginStatus').textContent = msg; }
function genCode(){ return Math.random().toString(36).slice(2,8).toUpperCase(); }

function normalizeGroupSlots(profile){
  const slots = Array.isArray(profile?.groupSlots) ? profile.groupSlots.slice(0,2) : [];
  while(slots.length < 2) slots.push({ code:'', name:'' });
  if((profile?.groupCode || '') && !slots[0]?.code){
    slots[0] = { code: profile.groupCode || '', name: profile.groupName || '' };
  }
  return slots.map(s => ({ code: s?.code || '', name: s?.name || '' }));
}
function getActiveSlot(){
  const slots = normalizeGroupSlots(currentProfile || {});
  return slots[activeGroupIndex] || { code:'', name:'' };
}
async function persistGroupSlots(){
  if(!currentUser) return;
  const slots = normalizeGroupSlots(currentProfile || {});
  currentProfile.groupSlots = slots;
  await update(ref(db, 'users/' + currentUser.uid + '/profile'), {
    groupSlots: slots,
    groupCode: slots[0]?.code || '',
    groupName: slots[0]?.name || '',
    activeGroupIndex
  });
}
function refreshGroupSlotUI(){
  const slots = normalizeGroupSlots(currentProfile || {});
  const firstLabel = slots[0]?.code ? (slots[0].name || slots[0].code) : '群組1';
  const secondLabel = slots[1]?.code ? (slots[1].name || slots[1].code) : (slots[0]?.code ? '群組2' : '群組2');
  if(qs('slotBtn0')){
    qs('slotBtn0').textContent = firstLabel;
    qs('slotBtn0').className = activeGroupIndex === 0 ? 'btn slot-btn-active' : 'btn5';
  }
  if(qs('slotBtn1')){
    qs('slotBtn1').textContent = secondLabel;
    qs('slotBtn1').className = activeGroupIndex === 1 ? 'btn slot-btn-active' : 'btn5';
  }
}
async function switchGroupSlot(idx){
  activeGroupIndex = idx;
  refreshGroupSlotUI();
  const slot = getActiveSlot();
  qs('groupName').value = slot?.name || '';
  await persistGroupSlots();
  await loadSocial();
}

async function saveNickname(){
  const nick = qs('nicknameInput').value.trim();
  if(!nick) return qs('loginStatus').textContent = '請先輸入暱稱';
  localStorage.setItem('temp_nickname', nick);
  if(currentUser){
    await update(ref(db, 'users/' + currentUser.uid + '/profile'), { nickname: nick });
    const slots = normalizeGroupSlots(currentProfile || {});
    await Promise.all(slots.filter(s=>s?.code).map(s=>update(ref(db, 'groups/' + s.code + '/members/' + currentUser.uid), { nickname: nick })));
    currentProfile = { ...(currentProfile || {}), nickname: nick };
    qs('helloTag').textContent = 'Hi ' + nick;
    qs('helloText').textContent = 'Hi ' + nick;
    qs('socialWho').textContent = nick + ' / 已登入';
    qs('loginStatus').textContent = '暱稱已更新';
    showPage('page-home');
    await loadSocial();
    return;
  }
  qs('loginStatus').textContent = '暱稱已暫存，登入後會套用';
}

async function ensureProfile(user){
  const tempNick = localStorage.getItem('temp_nickname') || '';
  const nick = tempNick || user.displayName || user.email?.split('@')[0] || '未命名';
  const pRef = ref(db, 'users/' + user.uid + '/profile');
  const snap = await get(pRef);
  if(!snap.exists()){
    await set(pRef, {
      uid: user.uid,
      nickname: nick,
      loginType: 'firebase',
      groupCode: '',
      groupName: '',
      personalCode: genCode(),
      createdAt: Date.now()
    });
  } else {
    const old = snap.val();
    if(tempNick && old.nickname !== tempNick){
      await update(pRef, { nickname: tempNick });
    }
  }
  const done = await get(pRef);
  currentProfile = done.val() || {};
  currentProfile.groupSlots = normalizeGroupSlots(currentProfile || {});
  if(typeof currentProfile.activeGroupIndex !== 'number') currentProfile.activeGroupIndex = 0;
  activeGroupIndex = currentProfile.activeGroupIndex || 0;
  if(!currentProfile.personalCode){
    currentProfile.personalCode = genCode();
    await update(pRef, { personalCode: currentProfile.personalCode });
  }
  qs('nicknameInput').value = currentProfile.nickname || '';
  qs('helloTag').textContent = 'Hi ' + (currentProfile.nickname || '使用者');
  qs('helloText').textContent = 'Hi ' + (currentProfile.nickname || '使用者');
  qs('socialWho').textContent = (currentProfile.nickname || '使用者') + ' / 已登入';
  if(qs('myPersonalCode')) qs('myPersonalCode').textContent = currentProfile.personalCode || '未設定';
  refreshGroupSlotUI();
  qs('logoutBtn').style.display = 'block';
}

async function signupNow(){
  const email = qs('emailInput').value.trim();
  const password = qs('passwordInput').value;
  if(!email || !password) return qs('loginStatus').textContent = '請輸入 Email 和密碼';
  localStorage.removeItem('temp_nickname');
  try{
    try{ groupLastSeenTime = Number(localStorage.getItem('lw_group_last_seen') || 0); privateLastSeenMap = JSON.parse(localStorage.getItem('lw_private_last_seen') || '{}') || {}; }catch(e){ groupLastSeenTime = 0; privateLastSeenMap = {}; }

await setPersistence(auth, browserLocalPersistence);
    await createUserWithEmailAndPassword(auth, email, password);
  }catch(e){
    qs('loginStatus').textContent = '註冊失敗：' + (e.code || e.message);
  }
}
async function loginNow(){
  if(currentUser){
    renderLoginView('profile');
    showPage('page-login');
    return;
  }
  const email = qs('emailInput').value.trim();
  const password = qs('passwordInput').value;
  if(!email || !password) return qs('loginStatus').textContent = '請輸入 Email 和密碼';
  try{
    try{ groupLastSeenTime = Number(localStorage.getItem('lw_group_last_seen') || 0); privateLastSeenMap = JSON.parse(localStorage.getItem('lw_private_last_seen') || '{}') || {}; }catch(e){ groupLastSeenTime = 0; privateLastSeenMap = {}; }

await setPersistence(auth, browserLocalPersistence);
    await signInWithEmailAndPassword(auth, email, password);
  }catch(e){
    qs('loginStatus').textContent = '登入失敗：' + (e.code || e.message);
  }
}
async function resetPasswordNow(){
  const email = qs('emailInput').value.trim();
  if(!email) return qs('loginStatus').textContent = '請先輸入 Email';
  try{
    await sendPasswordResetEmail(auth, email);
    qs('loginStatus').textContent = '重設信已寄出：' + email;
  }catch(e){
    qs('loginStatus').textContent = '寄送失敗：' + (e.code || e.message);
  }
}
async function logoutNow(){
  await signOut(auth);
  currentUser = null;
  currentProfile = null;
  unbindSocialRealtime();
  activeGroupIndex = 0;
  renderLoginView('auth');
  qs('helloTag').textContent = 'Hi 訪客';
  qs('helloText').textContent = 'Hi 訪客';
  qs('socialWho').textContent = '未登入';
  qs('loginStatus').textContent = '尚未登入';
  showPage('page-login');
}




async function estimateCalories(kind='meal'){
  const nameEl = kind === 'meal' ? qs('mealNameInput') : qs('drinkName');
  const kcalEl = kind === 'meal' ? qs('mealKcalInput') : qs('drinkKcal');
  const name = (nameEl?.value || '').trim();
  if(!name) return alert('請先輸入名稱');
  const oldPlaceholder = nameEl.placeholder;
  try{
    kcalEl.value = '';
    nameEl.placeholder = '估算中...';
    const res = await fetch(TEXT_CALORIE_ENDPOINT, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ kind, name })
    });
    const data = await res.json();
    if(!res.ok) throw new Error(data?.error || '估算失敗');
    kcalEl.value = Number(data?.kcal || 0);
  }catch(e){
    alert('估算失敗：' + (e.message || '請稍後再試'));
  }finally{
    nameEl.placeholder = oldPlaceholder;
  }
}

function calcMealTotal(){ return mealEntries.reduce((s,x)=>s+(Number(x.kcal)||0),0); }
function calcDrinkTotal(){ return drinkEntries.reduce((s,x)=>s+(Number(x.kcal)||0),0); }
function resetMealEditor(){
  editingMealIndex = -1;
  qs('mealNameInput').value='';
  qs('mealKcalInput').value='';
  qs('addMealBtn').textContent='新增餐點';
}
function resetDrinkEditor(){
  editingDrinkIndex = -1;
  qs('drinkName').value='';
  qs('drinkKcal').value='';
  qs('addDrinkBtn').textContent='新增飲料';
}
function editMeal(i){
  const x = mealEntries[i];
  if(!x) return;
  editingMealIndex = i;
  qs('mealNameInput').value = x.name || '';
  qs('mealKcalInput').value = Number(x.kcal)||0;
  qs('addMealBtn').textContent='儲存餐點';
}
function editDrink(i){
  const x = drinkEntries[i];
  if(!x) return;
  editingDrinkIndex = i;
  qs('drinkName').value = x.name || '';
  qs('drinkKcal').value = Number(x.kcal)||0;
  qs('addDrinkBtn').textContent='儲存飲料';
}
function renderEntries(){
  qs('todayMeals').value = mealEntries.length;
  const mealTotal = calcMealTotal();
  const drinkTotal = calcDrinkTotal();
  const total = mealTotal + drinkTotal;
  qs('mealTotalV').textContent = mealTotal;
  qs('drinkV').textContent = drinkTotal;
  if(qs('totalKcalV')) qs('totalKcalV').textContent = total + ' kcal';
  const dailyKcal = parseInt((qs('kcalV')?.textContent || '0').replace(/[^0-9]/g,''), 10) || 0;
  if(qs('totalKcalHint')){
    qs('totalKcalHint').textContent = total > dailyKcal && dailyKcal > 0 ? '已超過每日建議熱量' : '未超過每日建議熱量';
    qs('totalKcalHint').className = 'small' + (total > dailyKcal && dailyKcal > 0 ? ' danger-text' : '');
  }
  if(qs('totalKcalV')){
    qs('totalKcalV').className = 'v' + (total > dailyKcal && dailyKcal > 0 ? ' danger-text' : '');
  }
  qs('mealList').innerHTML = mealEntries.length ? mealEntries.map((x,i)=>`<div class="photo-item"><b>${escapeHtml(x.name||'未命名餐點')}</b>｜${Number(x.kcal)||0} kcal <div class="photo-actions"><button class="btn2" data-edit-meal="${i}">編輯</button><button class="btn4" data-del-meal="${i}">刪除</button></div></div>`).join('') : '<div class="muted">今天還沒有餐點</div>';
  qs('drinkList').innerHTML = drinkEntries.length ? drinkEntries.map((x,i)=>`<div class="photo-item"><b>${escapeHtml(x.name||'未命名飲料')}</b>｜${Number(x.kcal)||0} kcal <div class="photo-actions"><button class="btn2" data-edit-drink="${i}">編輯</button><button class="btn4" data-del-drink="${i}">刪除</button></div></div>`).join('') : '<div class="muted">今天還沒有飲料</div>';
  qs('mealList').querySelectorAll('[data-edit-meal]').forEach(btn=>btn.addEventListener('click', ()=>{
    editMeal(Number(btn.getAttribute('data-edit-meal')));
  }));
  qs('mealList').querySelectorAll('[data-del-meal]').forEach(btn=>btn.addEventListener('click', ()=>{
    const i = Number(btn.getAttribute('data-del-meal'));
    mealEntries.splice(i,1);
    if(editingMealIndex === i) resetMealEditor();
    renderEntries();
  }));
  qs('drinkList').querySelectorAll('[data-edit-drink]').forEach(btn=>btn.addEventListener('click', ()=>{
    editDrink(Number(btn.getAttribute('data-edit-drink')));
  }));
  qs('drinkList').querySelectorAll('[data-del-drink]').forEach(btn=>btn.addEventListener('click', ()=>{
    const i = Number(btn.getAttribute('data-del-drink'));
    drinkEntries.splice(i,1);
    if(editingDrinkIndex === i) resetDrinkEditor();
    renderEntries(); updateBurn();
  }));
}
function addMeal(){
  const name = qs('mealNameInput').value.trim();
  const kcal = Number(qs('mealKcalInput').value||0);
  if(!name) return alert('請輸入餐點名稱');
  if(editingMealIndex >= 0 && mealEntries[editingMealIndex]){
    mealEntries[editingMealIndex] = {name,kcal};
    resetMealEditor();
  }else{
    mealEntries.push({name,kcal});
  }
  qs('mealNameInput').value=''; qs('mealKcalInput').value='';
  renderEntries();
}
function addDrink(){
  const name = (qs('drinkName').value||'').trim();
  const kcal = Number(qs('drinkKcal').value||0);
  if(!name) return alert('請輸入飲料名稱');
  if(editingDrinkIndex >= 0 && drinkEntries[editingDrinkIndex]){
    drinkEntries[editingDrinkIndex] = {name,kcal};
    resetDrinkEditor();
  }else{
    drinkEntries.push({name,kcal});
  }
  qs('drinkName').value=''; qs('drinkKcal').value='';
  renderEntries(); updateBurn();
}


function renderStats(){
  const h=(+qs('height').value||177)/100;
  const w=(+qs('currentWeight').value||107);
  const t=(+qs('targetWeight').value||75);
  const mealsVal = +qs('meals').value || 2;
  const activityVal = qs('activity').value;
  const speedVal = qs('speed').value;

  const bmiNum=(w/(h*h));
  const bmi=bmiNum.toFixed(1);
  let bmiText='正常', bmiClass='bmi-normal';
  if(bmiNum < 18.5){ bmiText='過瘦'; bmiClass='bmi-under'; }
  else if(bmiNum < 24){ bmiText='正常'; bmiClass='bmi-normal'; }
  else if(bmiNum < 27){ bmiText='過重'; bmiClass='bmi-over'; }
  else { bmiText='肥胖'; bmiClass='bmi-obese'; }

  let kcal=Math.round(w*22);
  if(activityVal==='mid') kcal+=250;
  if(activityVal==='high') kcal+=420;
  if(speedVal==='fast') kcal-=300;
  if(speedVal==='slow') kcal+=120;
  if(mealsVal===1) kcal-=120;
  if(mealsVal===3) kcal+=120;
  const protein=Math.round(w*1.6 + (mealsVal===1 ? 10 : mealsVal===3 ? -5 : 0));

  let monthlyLoss = 2;
  if(speedVal==='fast') monthlyLoss=3;
  if(speedVal==='slow') monthlyLoss=1.5;
  if(activityVal==='high') monthlyLoss+=0.8;
  if(activityVal==='low') monthlyLoss-=0.4;
  monthlyLoss=Math.max(1, monthlyLoss);
  const months=Math.max(1, Math.ceil(Math.max(w-t,0.1)/monthlyLoss));

  let advice = '';
  if(w > 150){
    advice = '建議做法：哈哈哈，建議你去看醫生，讓醫生給點意見。';
  } else if(bmiNum < 18.5){
    advice = '建議做法：目前偏瘦，先規律吃飯、補足蛋白質與睡眠，避免再刻意節食。';
  } else if(bmiNum < 24){
    advice = '建議做法：目前在正常範圍，重點放在維持、穩定活動量與飲食品質。';
  } else if(bmiNum < 27){
    advice = '建議做法：目前過重，建議減少含糖飲料與宵夜，增加日常活動量。';
  } else {
    advice = '建議做法：目前肥胖，建議先從減糖、固定步行與穩定熱量赤字開始。';
  }

  qs('bmiV').textContent=bmi;
  qs('bmiLabel').textContent=bmiText;
  qs('bmiLabel').className='small ' + bmiClass;
  qs('kcalV').textContent=kcal+' kcal';
  qs('proteinV').textContent=protein+'g';
  qs('monthV').textContent=months+'個月';
  qs('planAdvice').textContent = advice;
  if(typeof renderEntries === 'function') renderEntries();
}

async function updatePlanAdviceAI(){
  renderStats();
  const w = +qs('currentWeight').value || 0;
  if(w > 150){
    qs('planAdvice').textContent = '建議做法：哈哈哈，建議你去看醫生，讓醫生給點意見。';
    return;
  }
  const payload = {
    heightCm: +qs('height').value || 0,
    weightKg: +qs('currentWeight').value || 0,
    targetWeightKg: +qs('targetWeight').value || 0,
    bmi: qs('bmiV').textContent || '',
    bmiLabel: qs('bmiLabel').textContent || '',
    mealsPerDay: +qs('meals').value || 0,
    activity: qs('activity').value || '',
    speed: qs('speed').value || ''
  };
  qs('planAdvice').textContent = '建議產生中...';
  try{
    const res = await fetch(PLAN_AI_ENDPOINT,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if(!res.ok) throw new Error(data?.error || '產生失敗');
    qs('planAdvice').textContent = data?.advice || '建議做法：先從穩定飲食與活動量開始。';
  }catch(e){
    renderStats();
  }
}
async function randomMenu(){
  const payload = {
    weightKg: +qs('currentWeight').value || 0,
    targetWeightKg: +qs('targetWeight').value || 0,
    bmi: qs('bmiV').textContent || '',
    bmiLabel: qs('bmiLabel').textContent || '',
    activity: qs('activity').value || '',
    speed: qs('speed').value || '',
    mealsPerDay: +qs('meals').value || 0
  };
  qs('menuBox').innerHTML = '<div class="menu-item">推薦中...</div>';
  try{
    const res = await fetch(MENU_AI_ENDPOINT,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if(!res.ok) throw new Error(data?.error || '推薦失敗');
    const menus = Array.isArray(data?.menus) ? data.menus : [];
    qs('menuBox').innerHTML = menus.length ? menus.map(m=>`<div class="menu-item"><span class="pill">${escapeHtml(m.name || '推薦')}</span><div style="margin-top:8px">• ${(m.items || []).map(escapeHtml).join('<br>• ')}</div><div class="sub" style="margin-top:8px">約 ${escapeHtml(String(m.kcal || 0))} kcal</div></div>`).join('') : '<div class="menu-item">目前沒有推薦結果</div>';
  }catch(e){
    qs('menuBox').innerHTML = '<div class="menu-item">推薦失敗</div>';
  }
}
function updateBurn(){ qs('burnV').textContent = ((+qs('runMin').value||0)*12).toFixed(0)+' kcal'; qs('drinkV').textContent = calcDrinkTotal(); }

function applyDrinkPreset(){}

async function saveToday(){
  if(!currentUser) return alert('先登入');
  const rec = {
    date: qs('logDate').value || today(),
    weight: +qs('logWeight').value||0,
    todayMeals: mealEntries.length,
    run: +qs('runMin').value||0,
    mealsDetail: mealEntries,
    mealsKcal: calcMealTotal(),
    drinksDetail: drinkEntries,
    drinkName: drinkEntries.map(x=>x.name).join('、'),
    drink: calcDrinkTotal(),
    totalKcal: calcMealTotal() + calcDrinkTotal(),
    checks: [qs('c1').checked,qs('c2').checked,qs('c3').checked,qs('c4').checked]
  };
  await set(ref(db, 'users/' + currentUser.uid + '/logs/' + rec.date), rec);
  qs('saveState').textContent = '已儲存';
  await renderHistory();
  await renderDaily();
  await drawTrend();
  await syncToGroup(rec);
}

async function renderHistory(){
  if(!currentUser) return;
  const snap = await get(ref(db, 'users/' + currentUser.uid + '/logs'));
  const arr = snap.exists() ? Object.values(snap.val()).sort((a,b)=>a.date.localeCompare(b.date)) : [];
  qs('histTable').innerHTML = arr.length ? arr.slice().reverse().map(r=>`<tr><td>${r.date}</td><td>${r.weight}</td><td>${r.mealsKcal||0}</td><td>${r.drink||0}</td><td>${r.totalKcal || ((r.mealsKcal||0)+(r.drink||0))}</td><td>${r.run}分</td><td>${(r.checks||[]).filter(Boolean).length}/4</td></tr>`).join('') : '<tr><td colspan="7">尚無紀錄</td></tr>';
}
async function renderDaily(){
  if(!currentUser) return;
  const d = qs('viewDate').value || today();
  const snap = await get(ref(db, 'users/' + currentUser.uid + '/logs/' + d));
  const r = snap.exists() ? snap.val() : null;
  qs('dailyBox').textContent = r ? `${r.date}｜體重 ${r.weight}kg｜食物 ${r.mealsKcal||0} kcal｜飲料 ${r.drink||0} kcal｜總卡路里 ${r.totalKcal || ((r.mealsKcal||0)+(r.drink||0))} kcal｜${r.todayMeals||0}餐｜跑步 ${r.run} 分｜打卡 ${(r.checks||[]).filter(Boolean).length}/4` : '這一天沒有紀錄';
}
async function drawTrend(){
  const canvas = qs('trend');
  const c=canvas.getContext('2d');
  c.clearRect(0,0,canvas.width,canvas.height);
  c.strokeStyle='#e5e7eb';
  for(let i=0;i<4;i++){ let y=30+i*60; c.beginPath(); c.moveTo(20,y); c.lineTo(880,y); c.stroke(); }
  if(!currentUser){ c.fillStyle='#94a3b8'; c.font='18px sans-serif'; c.fillText('先登入',40,80); return; }
  const snap = await get(ref(db, 'users/' + currentUser.uid + '/logs'));
  const arr = snap.exists() ? Object.values(snap.val()).sort((a,b)=>a.date.localeCompare(b.date)).slice(-7) : [];
  if(!arr.length){ c.fillStyle='#94a3b8'; c.font='18px sans-serif'; c.fillText('尚無趨勢資料',40,80); return; }
  const vals=arr.map(x=>x.weight||0), max=Math.max(...vals), min=Math.min(...vals);
  c.beginPath(); c.strokeStyle='#3167e3'; c.lineWidth=3;
  vals.forEach((v,i)=>{ let x=30+i*((840)/(Math.max(vals.length-1,1))); let y=220-((v-min)/((max-min)||1))*150; if(i===0)c.moveTo(x,y); else c.lineTo(x,y); });
  c.stroke();
}

async function savePhoto(){
  if(!currentUser) return alert('先登入');
  const f = qs('photoInput').files[0];
  if(!f) return alert('先選照片');
  const reader = new FileReader();
  reader.onload = async ()=>{
    const rec = {
      date: qs('photoDate').value || today(),
      privacy: qs('photoPrivacy').value,
      data: reader.result,
      nickname: currentProfile?.nickname || ''
    };
    await set(ref(db, 'users/' + currentUser.uid + '/photos/' + rec.date), rec);
    const slots = normalizeGroupSlots(currentProfile || {});
    for(const slot of slots){
      if(!slot?.code) continue;
      if(rec.privacy === 'public'){
        await set(ref(db, 'groups/' + slot.code + '/publicPhotos/' + currentUser.uid + '/' + rec.date), rec);
      }else{
        await remove(ref(db, 'groups/' + slot.code + '/publicPhotos/' + currentUser.uid + '/' + rec.date));
      }
    }
    await renderPhotos();
  };
  reader.readAsDataURL(f);
}
async function renderPhotos(){
  if(!currentUser) return;
  const snap = await get(ref(db, 'users/' + currentUser.uid + '/photos'));
  const arr = snap.exists() ? Object.values(snap.val()).sort((a,b)=>b.date.localeCompare(a.date)) : [];
  qs('photoList').innerHTML = arr.length ? arr.map(p=>`<div class="photo-item"><div><b>${p.date}</b> <span class="pill">${p.privacy==='public'?'公開':'不公開'}</span></div><img src="${p.data}"><div class="photo-actions"><button class="btn4" data-del-photo="${p.date}">刪除照片</button></div></div>`).join('') : '尚無照片';
  qs('photoList').querySelectorAll('[data-del-photo]').forEach(btn=>{
    btn.addEventListener('click', ()=>deletePhoto(btn.getAttribute('data-del-photo')));
  });
}
async function deletePhoto(date){
  if(!currentUser || !date) return;
  if(!confirm('確定刪除這張照片？')) return;
  await remove(ref(db, 'users/' + currentUser.uid + '/photos/' + date));
  const slots = normalizeGroupSlots(currentProfile || {});
  for(const slot of slots){
    if(slot?.code) await remove(ref(db, 'groups/' + slot.code + '/publicPhotos/' + currentUser.uid + '/' + date));
  }
  refreshGroupSlotUI();
  const slot = getActiveSlot();
  qs('groupName').value = slot?.name || '';
  await renderPhotos();
  await loadSocial();
  await loadFriends();
  setChatMode('group');
  setUnreadIndicator();
}
function copyPhotoPolicy(){
  const txt = qs('photoPrivacy').value==='public'?'照片目前設為公開':'照片目前設為不公開';
  navigator.clipboard.writeText(txt).then(()=> qs('photoPolicyText').textContent = txt);
}
async function analyzeFoodPhoto(){
  const f = qs('foodPhotoInput').files[0];
  if(!f) return qs('foodAiResult').textContent = '請先選一張食物照片';
  qs('foodAiResult').textContent = '辨識中...';
  const dataUrl = await new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = ()=>resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(f);
  });
  try{
    const res = await fetch(FOOD_AI_ENDPOINT, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ image: dataUrl })
    });
    const data = await res.json();
    if(!res.ok) throw new Error(data?.error || '辨識失敗');
    lastFoodAi = data;
    const foods = Array.isArray(data.items) ? data.items.map(x=>`${x.name}（約 ${x.kcal} kcal）`).join('、') : '';
    qs('foodAiResult').innerHTML = `<b>辨識結果：</b>${escapeHtml(data.summary || foods || '已完成')}<br><div style="margin-top:6px"><b>估算總熱量：</b>${escapeHtml(String(data.totalKcal || 0))} kcal</div><div class="small" style="margin-top:6px">這是估算值，實際熱量仍可能因份量不同而有差異。</div>`;
  }catch(e){
    lastFoodAi = null;
    qs('foodAiResult').innerHTML = `辨識失敗，請稍後再試。<br><span class="small">${escapeHtml(e.message || '請稍後再試')}</span>`;
  }
}
function useFoodCalories(){
  if(!lastFoodAi){
    qs('foodAiResult').textContent = '還沒有可套用的辨識結果';
    setTimeout(()=>{ if(qs('foodAiResult').textContent === '還沒有可套用的辨識結果') qs('foodAiResult').textContent = '可上傳食物照片，辨識後一鍵加入今日餐點。'; }, 3000);
    return;
  }
  mealEntries.push({name:(lastFoodAi.summary || '辨識食物').slice(0,60), kcal:Number(lastFoodAi.totalKcal || 0)});
  renderEntries();
  qs('foodAiResult').textContent = '已加入今日餐點';
  setTimeout(()=>{ if(qs('foodAiResult').textContent === '已加入今日餐點') qs('foodAiResult').textContent = '可上傳食物照片，辨識後一鍵加入今日餐點。'; }, 3000);
  showPage('page-home');
}
function saveReminder(){
  const data = {enabled: !!qs('reminderEnabled')?.checked, time:qs('remindTime').value, text:qs('remindText').value};
  localStorage.setItem('reminder_v175', JSON.stringify(data));
  alert(data.enabled ? '已開啟每日提醒' : '已關閉每日提醒');
}
function copyReminder(){
  const status = qs('reminderEnabled')?.checked ? '開啟' : '關閉';
  navigator.clipboard.writeText(status+'｜'+qs('remindTime').value+' '+qs('remindText').value);
}


function getPrivateChatId(a,b){ return [a,b].sort().join('_'); }

function unbindPrivateChat(){
  if(privateChatRef){
    off(privateChatRef);
    privateChatRef = null;
  }
}
function unbindFriends(){
  if(friendsRef){
    off(friendsRef);
    friendsRef = null;
  }
  if(friendRequestsRef){
    off(friendRequestsRef);
    friendRequestsRef = null;
  }
}
function setUnreadIndicator(){
  const total = (unreadGroupCount || 0) + (unreadPrivateCount || 0);
  if(!qs('chatFab')) return;
  if(total > 0) qs('chatFab').classList.add('chat-fab-unread');
  else qs('chatFab').classList.remove('chat-fab-unread');
}
function clearUnreadForCurrentChat(){
  if(currentChatMode === 'group'){
    groupLastSeenTime = Date.now();
    localStorage.setItem('lw_group_last_seen', String(groupLastSeenTime));
    unreadGroupCount = 0;
  } else if(currentChatMode === 'private' && activeFriendUid){
    privateLastSeenMap[activeFriendUid] = Date.now();
    localStorage.setItem('lw_private_last_seen', JSON.stringify(privateLastSeenMap));
    unreadPrivateCount = 0;
  }
  setUnreadIndicator();
}
function setChatMode(mode){
  currentChatMode = mode;
  if(qs('friendChatPickerWrap')) qs('friendChatPickerWrap').style.display = mode === 'private' ? 'block' : 'none';
  if(qs('chatTabGroup')) qs('chatTabGroup').className = mode === 'group' ? 'btn' : 'btn5';
  if(qs('chatTabFriend')) qs('chatTabFriend').className = mode === 'private' ? 'btn' : 'btn5';
  if(mode === 'group'){
    activeFriendUid = '';
    unbindPrivateChat();
    loadSocial();
  } else {
    qs('chatTitle').textContent = activeFriendUid ? '好友聊天' : '好友聊天';
    qs('chatStatus').textContent = activeFriendUid ? '私人聊天室已連線' : '請先選擇好友';
    if(!activeFriendUid) qs('cheerList').textContent = '請先選擇好友';
  }
}
function isFriendInAnyMyGroup(friendUid){
  const slots = normalizeGroupSlots(currentProfile || {});
  return slots.some(slot => {
    const box = window.__groupMembersCache?.[slot.code];
    return !!(slot.code && box && box[friendUid]);
  });
}
function refreshFriendChatSelect(map){
  if(!qs('friendChatSelect')) return;
  const arr = map ? Object.values(map) : [];
  qs('friendChatSelect').innerHTML = '<option value="">選擇好友聊天</option>' + arr.map(f=>`<option value="${f.uid}">${escapeHtml(f.nickname || '未命名')}</option>`).join('');
  if(activeFriendUid) qs('friendChatSelect').value = activeFriendUid;
}
async function removeFriend(friendUid){
  if(!currentUser || !friendUid) return;
  await remove(ref(db, 'friends/' + currentUser.uid + '/' + friendUid));
  await remove(ref(db, 'friends/' + friendUid + '/' + currentUser.uid));
  await remove(ref(db, 'friendRequests/' + currentUser.uid + '/' + friendUid));
  await remove(ref(db, 'friendRequests/' + friendUid + '/' + currentUser.uid));
  await remove(ref(db, 'privateChats/' + getPrivateChatId(currentUser.uid, friendUid)));
  delete privateLastSeenMap[friendUid];
  localStorage.setItem('lw_private_last_seen', JSON.stringify(privateLastSeenMap));
  if(activeFriendUid === friendUid){
    activeFriendUid = '';
    unbindPrivateChat();
    if(qs('friendChatSelect')) qs('friendChatSelect').value = '';
    qs('cheerList').textContent = '請先選擇好友';
    qs('chatStatus').textContent = '請先選擇好友';
  }
  unreadPrivateCount = 0;
  setUnreadIndicator();
}
async function acceptFriendRequest(fromUid){
  if(!currentUser || !fromUid) return;
  const reqSnap = await get(ref(db, 'friendRequests/' + currentUser.uid + '/' + fromUid));
  if(!reqSnap.exists()) return alert('找不到申請');
  const req = reqSnap.val() || {};
  await set(ref(db, 'friends/' + currentUser.uid + '/' + fromUid), {
    uid: fromUid,
    nickname: req.nickname || '未命名',
    personalCode: req.personalCode || '',
    addedAt: Date.now()
  });
  await set(ref(db, 'friends/' + fromUid + '/' + currentUser.uid), {
    uid: currentUser.uid,
    nickname: currentProfile?.nickname || '未命名',
    personalCode: currentProfile?.personalCode || '',
    addedAt: Date.now()
  });
  await remove(ref(db, 'friendRequests/' + currentUser.uid + '/' + fromUid));
}
async function rejectFriendRequest(fromUid){
  if(!currentUser || !fromUid) return;
  await remove(ref(db, 'friendRequests/' + currentUser.uid + '/' + fromUid));
}
function renderFriendRequests(map){
  const arr = map ? Object.values(map) : [];
  if(!qs('friendRequestList')) return;
  qs('friendRequestList').innerHTML = arr.length ? arr.map(r=>`<div class="request-card"><b>${escapeHtml(r.nickname || '未命名')}</b><div class="small" style="margin-top:6px">個人邀請碼：${escapeHtml(r.personalCode || '')}</div><div class="friend-actions"><button class="btn3" data-accept-friend="${r.uid}">同意</button><button class="btn4" data-reject-friend="${r.uid}">拒絕</button></div></div>`).join('') : '目前沒有好友申請';
  qs('friendRequestList').querySelectorAll('[data-accept-friend]').forEach(btn=>btn.addEventListener('click', ()=>acceptFriendRequest(btn.getAttribute('data-accept-friend'))));
  qs('friendRequestList').querySelectorAll('[data-reject-friend]').forEach(btn=>btn.addEventListener('click', ()=>rejectFriendRequest(btn.getAttribute('data-reject-friend'))));
}
async function addFriend(){
  if(!currentUser) return alert('先登入');
  const code = (qs('friendCodeInput').value || '').trim().toUpperCase();
  if(!code) return alert('先輸入朋友的個人邀請碼');
  if(code === (currentProfile?.personalCode || '')) return alert('不能加自己');
  const allSnap = await get(ref(db, 'users'));
  if(!allSnap.exists()) return alert('找不到使用者');
  const users = allSnap.val() || {};
  let foundUid = '';
  let foundProfile = null;
  for(const [uid, u] of Object.entries(users)){
    const p = u?.profile || {};
    if((p.personalCode || '').toUpperCase() === code){
      foundUid = uid;
      foundProfile = p;
      break;
    }
  }
  if(!foundUid) return alert('找不到這個個人邀請碼');
  const alreadyFriend = await get(ref(db, 'friends/' + currentUser.uid + '/' + foundUid));
  if(alreadyFriend.exists()) return alert('你們已經是好友了');
  await set(ref(db, 'friendRequests/' + foundUid + '/' + currentUser.uid), {
    uid: currentUser.uid,
    nickname: currentProfile?.nickname || '未命名',
    personalCode: currentProfile?.personalCode || '',
    time: Date.now()
  });
  qs('friendCodeInput').value = '';
  alert('已送出好友申請，等對方同意');
}
function renderFriendList(map){
  const arr = map ? Object.values(map) : [];
  cachedFriendsMap = map || {};
  refreshFriendChatSelect(map || {});
  qs('friendList').innerHTML = arr.length ? arr.map(f=>{
    const inMyTeam = isFriendInAnyMyGroup(f.uid);
    return `<div class="friend-card"><b>${escapeHtml(f.nickname || '未命名')}</b><div class="small" style="margin-top:6px">個人邀請碼：${escapeHtml(f.personalCode || '')}</div><div class="friend-actions"><button class="btn2" data-pm-friend="${f.uid}">私聊</button>${inMyTeam ? '' : `<button class="btn5" data-invite-friend="${f.uid}">邀請進隊</button>`}<button class="btn4" data-del-friend="${f.uid}">刪除好友</button></div></div>`;
  }).join('') : '尚無好友';
  qs('friendList').querySelectorAll('[data-pm-friend]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ setChatMode('private'); openPrivateChat(btn.getAttribute('data-pm-friend')); });
  });
  qs('friendList').querySelectorAll('[data-invite-friend]').forEach(btn=>{
    btn.addEventListener('click', ()=>inviteFriendToGroup(btn.getAttribute('data-invite-friend')));
  });
  qs('friendList').querySelectorAll('[data-del-friend]').forEach(btn=>{
    btn.addEventListener('click', ()=>removeFriend(btn.getAttribute('data-del-friend')));
  });
}
async function loadFriends(){
  if(!currentUser){
    unbindFriends();
    if(qs('friendList')) qs('friendList').textContent = '尚無好友';
    if(qs('friendRequestList')) qs('friendRequestList').textContent = '目前沒有好友申請';
    return;
  }
  unbindFriends();
  friendsRef = ref(db, 'friends/' + currentUser.uid);
  onValue(friendsRef, (snap)=>{
    renderFriendList(snap.exists() ? snap.val() : null);
  });
  friendRequestsRef = ref(db, 'friendRequests/' + currentUser.uid);
  onValue(friendRequestsRef, (snap)=>{
    renderFriendRequests(snap.exists() ? snap.val() : null);
  });
}
async function inviteFriendToGroup(friendUid){
  const slot = getActiveSlot();
  if(!currentUser || !slot?.code) return alert('你要先有目前群組');
  const msg = `請加入我的隊伍
群組邀請碼：${slot.code}`;
  try{
    await push(ref(db, 'privateChats/' + getPrivateChatId(currentUser.uid, friendUid) + '/messages'), {
      uid: currentUser.uid,
      nickname: currentProfile?.nickname || '未命名',
      text: msg,
      time: Date.now()
    });
    alert('已把群組邀請碼私聊給好友');
  }catch(e){
    alert('發送失敗');
  }
}
async function openPrivateChat(friendUid){
  if(!currentUser || !friendUid) return;
  currentChatMode = 'private';
  activeFriendUid = friendUid;
  qs('chatWidget').classList.add('open');
  qs('chatTitle').textContent = '好友聊天';
  qs('chatStatus').textContent = '私人聊天室已連線';
  unbindPrivateChat();
  const chatId = getPrivateChatId(currentUser.uid, friendUid);
  privateChatRef = ref(db, 'privateChats/' + chatId + '/messages');
  onValue(privateChatRef, (snap)=>{
    const msgs = snap.exists() ? Object.values(snap.val()).sort((a,b)=>a.time-b.time) : [];
    const lastSeen = Number(privateLastSeenMap[friendUid] || 0);
    const unseen = msgs.filter(m => (m.time || 0) > lastSeen && m.uid !== currentUser.uid).length;
    unreadPrivateCount = unseen;
    setUnreadIndicator();
    qs('cheerList').innerHTML = msgs.length ? msgs.slice(-80).map(c=>`<div class="chat-msg"><b>${escapeHtml(c.nickname || '未命名')}</b><div style="margin-top:6px">${escapeHtml(c.text || '')}</div><div class="small" style="margin-top:6px">${new Date(c.time || Date.now()).toLocaleString('zh-TW')}</div></div>`).join('') : '尚無訊息';
    qs('cheerList').scrollTop = qs('cheerList').scrollHeight;
    if(qs('chatWidget')?.classList.contains('open')) clearUnreadForCurrentChat();
  });
}

async function createGroup(){
  if(!currentUser) return alert('先登入');
  const slots = normalizeGroupSlots(currentProfile || {});
  if(slots[activeGroupIndex]?.code) return alert('這個群組槽位已經有群組了');
  const name = qs('groupName').value.trim() || `我的減脂群 ${activeGroupIndex+1}`;
  let code = genCode();
  while((await get(ref(db, 'groups/' + code))).exists()) code = genCode();
  await set(ref(db, 'groups/' + code), { code, name, ownerUid: currentUser.uid, createdAt: Date.now() });
  slots[activeGroupIndex] = { code, name };
  currentProfile.groupSlots = slots;
  await persistGroupSlots();
  await set(ref(db, 'groups/' + code + '/members/' + currentUser.uid), { uid: currentUser.uid, nickname: currentProfile.nickname || '未命名', role: 'leader' });
  qs('groupName').value = name;
  refreshGroupSlotUI();
  await loadSocial();
}
async function joinGroup(){
  if(!currentUser) return alert('先登入');
  const code = (qs('joinCode').value||'').trim().toUpperCase();
  if(!code) return alert('先輸入邀請碼');
  const g = await get(ref(db, 'groups/' + code));
  if(!g.exists()) return alert('找不到群組');
  const slots = normalizeGroupSlots(currentProfile || {});
  const already = slots.findIndex(s => s.code === code);
  if(already >= 0){
    activeGroupIndex = already;
    refreshGroupSlotUI();
    await persistGroupSlots();
    return loadSocial();
  }
  if(slots[activeGroupIndex]?.code) return alert('目前槽位已經有群組了，先切到另一個空槽位');
  slots[activeGroupIndex] = { code, name: g.val().name || '' };
  currentProfile.groupSlots = slots;
  await persistGroupSlots();
  await set(ref(db, 'groups/' + code + '/members/' + currentUser.uid), { uid: currentUser.uid, nickname: currentProfile.nickname || '未命名', role: 'member' });
  refreshGroupSlotUI();
  await loadSocial();
}
async function leaveGroup(){
  const slot = getActiveSlot();
  if(!currentUser || !slot?.code) return alert('目前這個槽位沒有加入群組');
  const ok = confirm(`確定要退出目前群組嗎？\n退出後，這個群組牆上的公開照片會移除，但你的個人照片會保留。`);
  if(!ok) return;
  const code = slot.code;
  await remove(ref(db, 'groups/' + code + '/members/' + currentUser.uid));
  await remove(ref(db, 'groups/' + code + '/publicPhotos/' + currentUser.uid));
  const slots = normalizeGroupSlots(currentProfile || {});
  slots[activeGroupIndex] = { code:'', name:'' };
  currentProfile.groupSlots = slots;
  await persistGroupSlots();
  qs('groupName').value = '';
  qs('joinCode').value = '';
  refreshGroupSlotUI();
  unbindSocialRealtime();
  await renderPhotos();
  await loadSocial();
  alert('已退出目前群組');
}
async function resyncPhotosToGroup(){
  const slot = getActiveSlot();
  if(!currentUser || !slot?.code) return alert('請先加入目前群組');
  const snap = await get(ref(db, 'users/' + currentUser.uid + '/photos'));
  const photos = snap.exists() ? (snap.val() || {}) : {};
  const privatePhotos = Object.entries(photos).filter(([_, p]) => p && (p.privacy === 'private' || !p.privacy));
  if(!privatePhotos.length) return alert('目前沒有可同步的私人照片');
  for(const [dateKey, photo] of privatePhotos){
    const nextPhoto = { ...photo, privacy: 'public', nickname: currentProfile?.nickname || '' };
    await update(ref(db, 'users/' + currentUser.uid + '/photos/' + dateKey), { privacy: 'public', nickname: nextPhoto.nickname });
    await set(ref(db, 'groups/' + slot.code + '/publicPhotos/' + currentUser.uid + '/' + dateKey), nextPhoto);
  }
  refreshGroupSlotUI();
  qs('groupName').value = getActiveSlot()?.name || '';
  await renderPhotos();
  await loadSocial();
  alert('已把私人照片重新同步到群組牆');
}

async function syncToGroup(rec){
  const slots = normalizeGroupSlots(currentProfile || {});
  for(const slot of slots){
    if(!slot?.code) continue;
    const memberSnap = await get(ref(db, 'groups/' + slot.code + '/members/' + currentUser.uid));
    const old = memberSnap.exists() ? memberSnap.val() : {};
    await update(ref(db, 'groups/' + slot.code + '/members/' + currentUser.uid), {
      uid: currentUser.uid,
      nickname: currentProfile.nickname || '未命名',
      role: old.role || 'member',
      lastLog: { weight: rec.weight, run: rec.run, drink: rec.drink, date: rec.date }
    });
  }
}
async function sendCheer(){
  const txt = qs('cheerMsg').value.trim();
  if(!txt) return;
  if(currentChatMode === 'private' && activeFriendUid){
    await push(ref(db, 'privateChats/' + getPrivateChatId(currentUser.uid, activeFriendUid) + '/messages'), {
      uid: currentUser.uid,
      nickname: currentProfile?.nickname || '未命名',
      text: txt,
      time: Date.now()
    });
    qs('cheerMsg').value = '';
    return;
  }
  const slot = getActiveSlot();
  if(!slot?.code) return alert('先建立或加入目前群組');
  await push(ref(db, 'groups/' + slot.code + '/cheers'), {
    uid: currentUser.uid,
    nickname: currentProfile.nickname || '未命名',
    text: txt,
    time: Date.now()
  });
  qs('cheerMsg').value = '';
}
function unbindSocialRealtime(){
  if(socialGroupRef){
    off(socialGroupRef);
    socialGroupRef = null;
  }
}
function renderSocialFromGroup(g){
  const slot = getActiveSlot();
  if(!currentUser || !slot?.code || !g){
    qs('myGroupCode').textContent = '尚未加入群組';
    qs('myGroupName').textContent = '尚未加入群組';
    qs('myRoleText').textContent = '尚未加入群組';
    qs('leaderboardBox').textContent = '尚未加入群組';
    qs('cheerList').textContent = '尚無訊息';
    qs('chatTitle').textContent = '群組聊天室';
    qs('chatStatus').textContent = '尚未加入群組';
    qs('publicPhotoWall').textContent = '尚無公開照片';
    return;
  }
  qs('myGroupCode').textContent = slot.code;
  qs('myGroupName').textContent = g.name || slot.name || '未命名群組';
  qs('groupName').value = g.name || slot.name || '';
  const membersMap = g.members || {};
  window.__groupMembersCache = window.__groupMembersCache || {};
  window.__groupMembersCache[slot.code] = membersMap;
  const myMember = membersMap[currentUser.uid] || {};
  qs('myRoleText').textContent = myMember.role === 'leader' ? '隊長' : '隊員';
  const members = Object.values(membersMap);
  const ranked = members.map(m=>({
    uid: m.uid || '',
    name: m.nickname || '未命名',
    role: m.role === 'leader' ? '隊長' : '隊員',
    run: m.lastLog?.run || 0,
    weight: m.lastLog?.weight ?? '-',
    drink: m.lastLog?.drink || 0
  })).sort((a,b)=>b.run-a.run);
  qs('leaderboardBox').innerHTML = ranked.length ? ranked.map((m,i)=>{
    const canAskFriend = m.uid && m.uid !== currentUser.uid && !cachedFriendsMap[m.uid];
    return `<div class="leader"><b>#${i+1} ${escapeHtml(m.name)}</b> <span class="pill">${m.role}</span><br>跑步 ${m.run} 分｜體重 ${m.weight} kg｜飲料 ${m.drink} kcal${canAskFriend ? `<div class="friend-actions"><button class="btn5" data-request-friend="${m.uid}">邀請好友</button></div>` : ''}</div>`;
  }).join('') : '尚無成員';
  qs('leaderboardBox').querySelectorAll('[data-request-friend]').forEach(btn=>{
    btn.addEventListener('click', async()=>{
      const uid = btn.getAttribute('data-request-friend');
      if(!uid) return;
      await set(ref(db, 'friendRequests/' + uid + '/' + currentUser.uid), {
        uid: currentUser.uid,
        nickname: currentProfile?.nickname || '未命名',
        personalCode: currentProfile?.personalCode || '',
        time: Date.now()
      });
      alert('已送出好友申請，等對方同意');
    });
  });
  const cheers = g.cheers ? Object.values(g.cheers).sort((a,b)=>a.time-b.time) : [];
  const unseen = cheers.filter(c => (c.time || 0) > groupLastSeenTime && c.uid !== currentUser.uid).length;
  unreadGroupCount = unseen;
  setUnreadIndicator();
  currentChatMode = 'group';
  activeFriendUid = '';
  qs('chatTitle').textContent = '群組聊天室';
  qs('cheerList').innerHTML = cheers.length ? cheers.slice(-50).map(c=>`<div class="chat-msg"><b>${escapeHtml(c.nickname || '未命名')}</b><div style="margin-top:6px">${escapeHtml(c.text || '')}</div><div class="small" style="margin-top:6px">${new Date(c.time || Date.now()).toLocaleString('zh-TW')}</div></div>`).join('') : '尚無訊息';
  qs('chatStatus').textContent = `即時聊天室已連線｜群組：${g.name || slot.name || '未命名群組'}`;
  const box = qs('cheerList'); box.scrollTop = box.scrollHeight;
  if(qs('chatWidget')?.classList.contains('open') && currentChatMode === 'group') clearUnreadForCurrentChat();
  const publicPhotosMap = g.publicPhotos || {};
  const memberEntries = Object.entries(membersMap);
  qs('publicPhotoWall').innerHTML = memberEntries.length ? `<div class="wall-grid">` + memberEntries.map(([uid, member])=>{
    const userPhotos = publicPhotosMap[uid] ? Object.values(publicPhotosMap[uid]).sort((a,b)=>String(b.date).localeCompare(String(a.date))) : [];
    const cover = userPhotos[0]?.data ? `<img class="wall-cover" src="${userPhotos[0].data}" alt="">` : `<div class="photo-empty wall-cover">尚未上傳公開照片</div>`;
    const canAskFriend = uid !== currentUser.uid && !cachedFriendsMap[uid];
    return `<div class="photo-wall-person"><div class="photo-wall-header"><div><b>${escapeHtml(member.nickname || '未命名')}</b> <span class="pill">${member.role === 'leader' ? '隊長' : '隊員'}</span></div><div class="small">${userPhotos.length} 張</div></div>${cover}<div class="small" style="margin-top:8px">${userPhotos[0]?.date ? `最新：${escapeHtml(userPhotos[0].date)}` : '目前沒有公開照片'}</div>${canAskFriend ? `<div class="friend-actions"><button class="btn5" data-request-friend-wall="${uid}">邀請好友</button></div>` : ''}<div class="photo-slider" style="margin-top:8px">${userPhotos.slice(0,6).map(p=>`<div class="photo-slide"><img src="${p.data}" alt=""><div class="small" style="margin-top:6px">${escapeHtml(p.date||'')}</div></div>`).join('') || ''}</div></div>`;
  }).join('') + `</div>` : '尚無公開照片';
  qs('publicPhotoWall').querySelectorAll('[data-request-friend-wall]').forEach(btn=>{
    btn.addEventListener('click', async()=>{
      const uid = btn.getAttribute('data-request-friend-wall');
      if(!uid) return;
      await set(ref(db, 'friendRequests/' + uid + '/' + currentUser.uid), {
        uid: currentUser.uid,
        nickname: currentProfile?.nickname || '未命名',
        personalCode: currentProfile?.personalCode || '',
        time: Date.now()
      });
      alert('已送出好友申請，等對方同意');
    });
  });
}
async function loadSocial(){
  const slot = getActiveSlot();
  if(!currentUser || !slot?.code){
    unbindSocialRealtime();
    renderSocialFromGroup(null);
    return;
  }
  unbindSocialRealtime();
  socialGroupRef = ref(db, 'groups/' + slot.code);
  onValue(socialGroupRef, async(snap)=>{
    if(!snap.exists()){
      renderSocialFromGroup(null);
      return;
    }
    const g = snap.val();
    const slots = normalizeGroupSlots(currentProfile || {});
    if((slots[activeGroupIndex]?.name || '') !== (g.name || '')){
      slots[activeGroupIndex].name = g.name || '';
      currentProfile.groupSlots = slots;
      await persistGroupSlots();
    }
    renderSocialFromGroup(g);
  });
}
async function initAfterLogin(){
  renderStats();
  randomMenu();
  renderEntries();
  updateBurn();
  try{
    const r = JSON.parse(localStorage.getItem('reminder_v175')||'null');
    if(r){
      if(qs('reminderEnabled')) qs('reminderEnabled').checked = !!r.enabled;
      if(qs('remindTime')) qs('remindTime').value = r.time || '21:00';
      if(qs('remindText')) qs('remindText').value = r.text || '記得量體重、控制飲料、拍照紀錄';
    }
  }catch(e){}

  qs('logDate').value = today();
  qs('viewDate').value = today();
  qs('photoDate').value = today();
  await renderHistory();
  await renderDaily();
  await drawTrend();
  refreshGroupSlotUI();
  const slot = getActiveSlot();
  qs('groupName').value = slot?.name || '';
  await renderPhotos();
  await loadSocial();
  await loadFriends();
  setChatMode('group');
  setUnreadIndicator();
}
if(qs('addMealBtn')) qs('addMealBtn').addEventListener('click', addMeal);
if(qs('addDrinkBtn')) qs('addDrinkBtn').addEventListener('click', addDrink);
if(qs('estimateMealBtn')) qs('estimateMealBtn').addEventListener('click', ()=>estimateCalories('meal'));
if(qs('estimateDrinkBtn')) qs('estimateDrinkBtn').addEventListener('click', ()=>estimateCalories('drink'));
if(qs('saveNickBtn')) qs('saveNickBtn').addEventListener('click', saveNickname);
qs('signupBtn').addEventListener('click', signupNow);
qs('loginBtn').addEventListener('click', loginNow);
qs('resetBtn').addEventListener('click', resetPasswordNow);
qs('logoutBtn').addEventListener('click', logoutNow);
qs('backBtn').addEventListener('click', ()=>{ if(currentUser){ showPage('page-home'); } else { renderLoginView('auth'); showPage('page-login'); } });
qs('updatePlanBtn').addEventListener('click', updatePlanAdviceAI);
qs('redrawMenuBtn').addEventListener('click', randomMenu);
qs('runMin').addEventListener('input', updateBurn);
qs('drinkKcal').addEventListener('input', updateBurn);
qs('saveTodayBtn').addEventListener('click', saveToday);
qs('savePhotoBtn').addEventListener('click', savePhoto);
qs('copyPolicyBtn').addEventListener('click', copyPhotoPolicy);
qs('saveReminderBtn').addEventListener('click', saveReminder);
qs('copyReminderBtn').addEventListener('click', copyReminder);
qs('createGroupBtn').addEventListener('click', createGroup);
if(qs('slotBtn0')) qs('slotBtn0').addEventListener('click', ()=>switchGroupSlot(0));
if(qs('slotBtn1')) qs('slotBtn1').addEventListener('click', ()=>switchGroupSlot(1));
qs('leaveGroupBtn').addEventListener('click', leaveGroup);
qs('joinGroupBtn').addEventListener('click', joinGroup);
if(qs('resyncPhotosBtn')) qs('resyncPhotosBtn').addEventListener('click', resyncPhotosToGroup);
if(qs('addFriendBtn')) qs('addFriendBtn').addEventListener('click', addFriend);
if(qs('copyPersonalCodeBtn')) qs('copyPersonalCodeBtn').addEventListener('click', ()=>navigator.clipboard.writeText(qs('myPersonalCode').textContent || ''));
qs('sendCheerBtn').addEventListener('click', sendCheer);
qs('analyzeFoodBtn').addEventListener('click', analyzeFoodPhoto);
qs('useFoodCaloriesBtn').addEventListener('click', useFoodCalories);
qs('chatFab').addEventListener('click', ()=>{
  qs('chatWidget').classList.toggle('open');
  if(qs('chatWidget').classList.contains('open')) clearUnreadForCurrentChat();
});
qs('closeChatBtn').addEventListener('click', ()=>qs('chatWidget').classList.remove('open'));
if(qs('chatTabGroup')) qs('chatTabGroup').addEventListener('click', ()=>setChatMode('group'));
if(qs('chatTabFriend')) qs('chatTabFriend').addEventListener('click', ()=>setChatMode('private'));
if(qs('friendChatSelect')) qs('friendChatSelect').addEventListener('change', ()=>{ const uid = qs('friendChatSelect').value; if(uid){ setChatMode('private'); openPrivateChat(uid);} });
qs('cheerMsg').addEventListener('keydown', (e)=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); sendCheer(); } });
qs('viewDate').addEventListener('change', renderDaily);
qs('editProfileBtn').addEventListener('click', ()=>{ renderLoginView('profile'); showPage('page-login'); });
qs('navHome').addEventListener('click', ()=>showPage('page-home'));
qs('navPhoto').addEventListener('click', ()=>showPage('page-photo'));
qs('navSocial').addEventListener('click', ()=>{showPage('page-social'); loadSocial();});
qs('photoPrivacy').addEventListener('change', ()=>{ qs('photoPolicyText').textContent = qs('photoPrivacy').value==='public'?'目前預設：公開':'目前預設：不公開'; });

try{ groupLastSeenTime = Number(localStorage.getItem('lw_group_last_seen') || 0); privateLastSeenMap = JSON.parse(localStorage.getItem('lw_private_last_seen') || '{}') || {}; }catch(e){ groupLastSeenTime = 0; privateLastSeenMap = {}; }

await setPersistence(auth, browserLocalPersistence);

onAuthStateChanged(auth, async(user)=>{
  currentUser = user;
  if(user){
    await ensureProfile(user);
    renderLoginView('auth');
    qs('loginStatus').textContent = '已登入：' + (currentProfile?.nickname || user.email || user.uid);
    showPage('page-home');
    await initAfterLogin();
  } else {
    renderLoginView('auth');
    qs('loginStatus').textContent = '尚未登入';
    qs('helloTag').textContent = 'Hi 訪客';
    qs('helloText').textContent = 'Hi 訪客';
    qs('socialWho').textContent = '未登入';
    qs('logDate').value = today();
    qs('viewDate').value = today();
    qs('photoDate').value = today();
    renderStats();
    randomMenu();
    renderEntries();
    updateBurn();
    showPage('page-login');
  }
});

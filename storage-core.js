// storage-core.js — unifie les écritures & publie des stats, sans casser l'existant
(function(){
  const BUS = ('BroadcastChannel' in window) ? new BroadcastChannel('quiz-app') : null;
  const KEYS_WATCH = ['students','studentsByClass','quizzes','historiqueParties'];

  const safeJSON = (v, fb=null)=>{ try{return JSON.parse(v);}catch{return fb;} };

  function read(k, fb){
    const raw = localStorage.getItem(k);
    return raw ? safeJSON(raw, fb) : (fb ?? null);
  }
  function write(k, v){
    localStorage.setItem(k, JSON.stringify(v));
    notifyChange([k]);
  }

  // Agrège students + studentsByClass (héritage) et dédoublonne
  function collectStudents(){
    const s  = (read('students', []) || []).slice();
    const bc = read('studentsByClass', {}) || {};
    Object.entries(bc).forEach(([cls, arr])=>{
      (arr||[]).forEach(n => s.push({ name:String(n).trim(), classe:cls }));
    });
    const seen=new Set(), out=[];
    s.forEach(x=>{
      const name=(x.name || ((x.prenom||'')+' '+(x.nom||''))).trim();
      const cls =(x.classe||'').trim();
      const key=(name+'|'+cls).toLowerCase();
      if(name && !seen.has(key)){ seen.add(key); out.push({name, classe:cls}); }
    });
    return out;
  }

  function computeStats(){
    const allStudents = collectStudents();
    const quizzes = read('quizzes', []) || [];
    const games   = read('historiqueParties', []) || [];
    const byClass = read('studentsByClass', {}) || {};
    const classCount = Object.keys(byClass).length || new Set(allStudents.map(s=>s.classe).filter(Boolean)).size;

    return {
      studentCount: allStudents.length,
      quizCount: quizzes.length,
      gameCount: games.length,
      classCount,
      updatedAt: Date.now()
    };
  }

  function publishStats(){
    const stats = computeStats();
    localStorage.setItem('dashboard_stats', JSON.stringify(stats)); // utile même sans BroadcastChannel
    if (BUS) BUS.postMessage({ type:'stats', stats });
    window.dispatchEvent(new CustomEvent('DATA_CHANGED', { detail:{ type:'stats', stats }}));
  }

  function notifyChange(keys){
    // recalcul des stats seulement si une clé utile a bougé
    if (keys.some(k=>KEYS_WATCH.includes(k))) publishStats();
    if (BUS) BUS.postMessage({ type:'changed', keys });
    window.dispatchEvent(new CustomEvent('DATA_CHANGED', { detail:{ type:'changed', keys }}));
  }

  // Monkey-patch léger: toute écriture locale continue de marcher,
  // mais on met à jour les stats + on diffuse l’info
  const _set = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function(k, v){
    _set(k, v);
    if (KEYS_WATCH.includes(k)) notifyChange([k]);
    if (k === 'students' || k === 'studentsByClass') {
      // petite migration douce: si studentsByClass rempli et students vide -> créer students
      const s  = read('students', []);
      const bc = read('studentsByClass', {});
      if ((!s || !s.length) && bc && Object.keys(bc).length){
        const merged = collectStudents().map(x=>({name:x.name, classe:x.classe, points:0, subjects:{}, createdAt:new Date().toISOString()}));
        _set('students', JSON.stringify(merged));
        notifyChange(['students']);
      }
    }
  };

  // Calcule des stats au chargement (utile pour admin.html au premier affichage)
  publishStats();

  // Expose quelques helpers si tu veux les utiliser ailleurs
  window.StorageCore = { read, write, collectStudents, computeStats };
})();

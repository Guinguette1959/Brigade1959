
import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import { Home, ClipboardList, Package, History, RefreshCcw, Search, CheckCircle2, Circle, Send } from 'lucide-react';
import './styles.css';
import { seedData } from './seedData.js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://jajhwtwaxqemxmtamhoo.supabase.co';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_eMi46zoTzfHn1Z19g06BTw_WpQ5rzPL';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function mondayOfWeek(date = new Date()) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

function formatDateFr(dateString) {
  return new Date(dateString).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function isRealProductName(name) {
  const n = String(name || '').trim();
  const low = n.toLowerCase();
  if (!n || n.length < 2) return false;
  const exactBad = ['produit','produits','fournisseur','fournisseurs','note','notes','stock','stock actuel','quantité','quantite','à commander','a commander','suggestion','semaine dernière','semaine derniere','moyenne','historique','total','totaux','nombre de produits','livraison','livraisons'];
  if (exactBad.includes(low)) return false;
  const containsBad = ['jour de livraison','jours de livraison','jour commande','jours commande','commande pour','livraison pour','date de livraison','date commande','nombre de produits','produits total','total produits','préparée','preparee','passée','passee'];
  if (containsBad.some(x => low.includes(x))) return false;
  if (/^\d+\s*(produit|produits|référence|references?)$/i.test(n)) return false;
  if (/^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/i.test(n)) return false;
  return true;
}

function statusLabel(status) {
  if (status?.prepared && status?.passed) return 'Passée';
  if (status?.prepared) return 'Préparée';
  return 'À préparer';
}
function statusClass(status) {
  if (status?.prepared && status?.passed) return 'passed';
  if (status?.prepared) return 'prepared';
  return 'draft';
}

function App() {
  const [view, setView] = useState('today');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('Chargement...');
  const [selectedWeekStart, setSelectedWeekStart] = useState(mondayOfWeek());
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [period, setPeriod] = useState(null);
  const [items, setItems] = useState({});
  const [previousItems, setPreviousItems] = useState({});
  const [historyItems, setHistoryItems] = useState({});
  const [statuses, setStatuses] = useState({});
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [allProducts, setAllProducts] = useState(false);
  const [search, setSearch] = useState('');

  async function ensureSeed() {
    const existing = await supabase.from('suppliers').select('id').limit(1);
    if (existing.error) throw existing.error;
    if (existing.data?.length) return;

    for (const s of seedData) {
      const isTerre = /terre/i.test(s.supplier);
      const isSensitive = /terre|passion|brosset|boulanger|gastro/i.test(s.supplier);
      const created = await supabase.from('suppliers').insert({
        name: s.supplier,
        sensitive: isSensitive,
        order_days: isTerre ? ['dimanche','mercredi'] : ['dimanche'],
        delivery_days: isTerre ? ['mardi','jeudi','samedi'] : []
      }).select().single();
      if (created.error) throw created.error;

      const rows = s.products.filter(isRealProductName).map((name, i) => ({
        supplier_id: created.data.id,
        name,
        sort_order: i + 1,
        active: true
      }));
      const inserted = await supabase.from('products').insert(rows);
      if (inserted.error) throw inserted.error;
    }
  }

  async function loadAll(weekStart = selectedWeekStart) {
    setLoading(true);
    setMessage('Chargement...');
    await ensureSeed();

    const sRes = await supabase.from('suppliers').select('*').order('name');
    if (sRes.error) throw sRes.error;

    const pRes = await supabase.from('products').select('*').eq('active', true).order('sort_order');
    if (pRes.error) throw pRes.error;

    let periodRes = await supabase.from('supply_periods').select('*').eq('period_start', weekStart).maybeSingle();
    if (periodRes.error) throw periodRes.error;

    let currentPeriod = periodRes.data;
    if (!currentPeriod) {
      const created = await supabase.from('supply_periods').insert({ period_start: weekStart, activity_coef: 1, note: '' }).select().single();
      if (created.error) throw created.error;
      currentPeriod = created.data;
    }

    const itemsRes = await supabase.from('supply_items').select('*').eq('period_id', currentPeriod.id);
    if (itemsRes.error) throw itemsRes.error;

    const statusesRes = await supabase.from('supplier_order_statuses').select('*').eq('period_id', currentPeriod.id);
    if (statusesRes.error) throw statusesRes.error;

    const prevPeriods = await supabase.from('supply_periods').select('*').lt('period_start', currentPeriod.period_start).order('period_start', { ascending:false }).limit(4);
    let prev = {};
    let hist = {};
    if (!prevPeriods.error && prevPeriods.data?.length) {
      const ids = prevPeriods.data.map(p => p.id);
      const hRes = await supabase.from('supply_items').select('*').in('period_id', ids);
      if (!hRes.error) {
        hRes.data.forEach(item => {
          if (!hist[item.product_id]) hist[item.product_id] = [];
          hist[item.product_id].push(item);
        });
        hRes.data.filter(x => x.period_id === ids[0]).forEach(item => { prev[item.product_id] = item; });
      }
    }

    const cleanProducts = (pRes.data || []).filter(p => isRealProductName(p.name));
    setSuppliers(sRes.data || []);
    setProducts(cleanProducts);
    setPeriod(currentPeriod);
    setItems(Object.fromEntries((itemsRes.data || []).map(i => [i.product_id, i])));
    setPreviousItems(prev);
    setHistoryItems(hist);
    setStatuses(Object.fromEntries((statusesRes.data || []).map(s => [s.supplier_id, s])));
    setSelectedSupplier(old => old || sRes.data?.[0]?.id || null);
    setMessage('Sauvegarde automatique active');
    setLoading(false);
  }

  useEffect(() => {
    loadAll(selectedWeekStart).catch(error => {
      console.error(error);
      setMessage('Erreur : ' + error.message);
      setLoading(false);
    });
  }, [selectedWeekStart]);

  const filteredProducts = useMemo(() => {
    let list = allProducts ? products : products.filter(p => p.supplier_id === selectedSupplier);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(p => p.name.toLowerCase().includes(q));
    return list;
  }, [products, allProducts, selectedSupplier, search]);

  function supplierProducts(supplierId) {
    return products.filter(p => p.supplier_id === supplierId);
  }

  function supplierProgress(supplierId) {
    const list = supplierProducts(supplierId);
    return {
      total: list.length,
      checked: list.filter(p => items[p.id]?.inventory_checked).length,
      ordered: list.filter(p => Number(items[p.id]?.quantity_ordered || 0) > 0).length
    };
  }

  async function saveItem(productId, patch) {
    const existing = items[productId] || { period_id: period.id, product_id: productId };
    const updated = { ...existing, ...patch, updated_at: new Date().toISOString() };
    setItems(prev => ({ ...prev, [productId]: updated }));

    const payload = {
      period_id: period.id,
      product_id: productId,
      stock_current: updated.stock_current === '' ? null : updated.stock_current,
      quantity_ordered: updated.quantity_ordered === '' ? null : updated.quantity_ordered,
      note: updated.note || null,
      inventory_checked: !!updated.inventory_checked,
      updated_at: updated.updated_at
    };
    const res = await supabase.from('supply_items').upsert(payload, { onConflict:'period_id,product_id' });
    if (res.error) setMessage('Erreur sauvegarde : ' + res.error.message);
    else setMessage('Sauvegardé');
  }

  async function saveStatus(supplierId, patch) {
    const existing = statuses[supplierId] || { period_id: period.id, supplier_id: supplierId };
    const now = new Date().toISOString();
    const updated = { ...existing, ...patch, updated_at: now };
    if ('prepared' in patch && patch.prepared) updated.prepared_at = now;
    if ('passed' in patch && patch.passed) updated.passed_at = now;
    setStatuses(prev => ({ ...prev, [supplierId]: updated }));

    const res = await supabase.from('supplier_order_statuses').upsert({
      period_id: period.id,
      supplier_id: supplierId,
      prepared: !!updated.prepared,
      passed: !!updated.passed,
      prepared_at: updated.prepared_at || null,
      passed_at: updated.passed_at || null,
      passed_mode: updated.passed_mode || null,
      note: updated.note || null,
      updated_at: now
    }, { onConflict:'period_id,supplier_id' });
    if (res.error) setMessage('Erreur statut : ' + res.error.message);
    else setMessage('Statut sauvegardé');
  }

  async function saveContext(patch) {
    setPeriod(prev => ({ ...prev, ...patch }));
    const res = await supabase.from('supply_periods').update(patch).eq('id', period.id);
    if (res.error) setMessage('Erreur contexte : ' + res.error.message);
    else setMessage('Contexte sauvegardé');
  }

  async function resetInventoryChecks() {
    if (!confirm('Décocher tous les produits vérifiés de cette semaine ?')) return;
    const res = await supabase.from('supply_items').update({ inventory_checked:false }).eq('period_id', period.id);
    if (res.error) return setMessage('Erreur : ' + res.error.message);
    setItems(prev => {
      const copy = { ...prev };
      Object.keys(copy).forEach(id => copy[id] = { ...copy[id], inventory_checked:false });
      return copy;
    });
    setMessage('Coches réinitialisées');
  }

  async function resetSupplierOrder() {
    if (!selectedSupplier || !confirm('Réinitialiser la commande de ce fournisseur ?')) return;
    for (const p of supplierProducts(selectedSupplier)) {
      await saveItem(p.id, { quantity_ordered:null });
    }
    await saveStatus(selectedSupplier, { prepared:false, passed:false, prepared_at:null, passed_at:null, passed_mode:null });
    setMessage('Commande fournisseur réinitialisée');
  }

  function moveWeek(delta) {
    const d = new Date(selectedWeekStart);
    d.setDate(d.getDate() + delta * 7);
    setSelectedWeekStart(d.toISOString().slice(0,10));
  }

  function copyOrder() {
    const supplier = suppliers.find(s => s.id === selectedSupplier);
    const lines = supplierProducts(selectedSupplier)
      .filter(p => Number(items[p.id]?.quantity_ordered || 0) > 0)
      .map(p => `- ${p.name} : ${items[p.id].quantity_ordered}${items[p.id].note ? ' (' + items[p.id].note + ')' : ''}`);
    if (!lines.length) return alert('Aucune ligne à commander.');
    navigator.clipboard.writeText(`Bonjour,\n\nVoici notre commande ${supplier?.name || ''} :\n\n${lines.join('\n')}\n\nMerci.`);
    alert('Commande copiée.');
  }

  const totals = useMemo(() => {
    const total = products.length;
    const checked = products.filter(p => items[p.id]?.inventory_checked).length;
    const ordered = products.filter(p => Number(items[p.id]?.quantity_ordered || 0) > 0).length;
    const doneSuppliers = suppliers.filter(s => statuses[s.id]?.passed).length;
    return { total, checked, ordered, doneSuppliers, pct: total ? Math.round((checked/total)*100) : 0 };
  }, [products, items, suppliers, statuses]);

  if (loading) return <div className="loading">Chargement de Brigade 1959...</div>;

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>Brigade 1959</h1>
          <p>{message}</p>
        </div>
        <button className="secondary small" onClick={() => loadAll(selectedWeekStart)}><RefreshCcw size={16}/>Actualiser</button>
      </header>

      <nav className="nav">
        <button className={view === 'today' ? 'active' : ''} onClick={() => setView('today')}><Home size={18}/>Aujourd'hui</button>
        <button className={view === 'inventory' ? 'active' : ''} onClick={() => setView('inventory')}><ClipboardList size={18}/>Inventaire</button>
        <button className={view === 'orders' ? 'active' : ''} onClick={() => setView('orders')}><Package size={18}/>Commandes</button>
        <button className={view === 'history' ? 'active' : ''} onClick={() => setView('history')}><History size={18}/>Historique</button>
      </nav>

      <main>
        {view === 'today' && (
          <TodayView
            selectedWeekStart={selectedWeekStart}
            moveWeek={moveWeek}
            totals={totals}
            period={period}
            saveContext={saveContext}
            suppliers={suppliers}
            statuses={statuses}
            supplierProgress={supplierProgress}
            setSelectedSupplier={setSelectedSupplier}
            setView={setView}
          />
        )}

        {view === 'inventory' && (
          <WorkView
            mode="inventory"
            suppliers={suppliers}
            products={filteredProducts}
            allProducts={allProducts}
            setAllProducts={setAllProducts}
            selectedSupplier={selectedSupplier}
            setSelectedSupplier={setSelectedSupplier}
            search={search}
            setSearch={setSearch}
            items={items}
            previousItems={previousItems}
            historyItems={historyItems}
            saveItem={saveItem}
            resetInventoryChecks={resetInventoryChecks}
          />
        )}

        {view === 'orders' && (
          <WorkView
            mode="orders"
            suppliers={suppliers}
            products={filteredProducts}
            allProducts={allProducts}
            setAllProducts={setAllProducts}
            selectedSupplier={selectedSupplier}
            setSelectedSupplier={setSelectedSupplier}
            search={search}
            setSearch={setSearch}
            items={items}
            previousItems={previousItems}
            historyItems={historyItems}
            saveItem={saveItem}
            statuses={statuses}
            saveStatus={saveStatus}
            copyOrder={copyOrder}
            resetSupplierOrder={resetSupplierOrder}
            period={period}
          />
        )}

        {view === 'history' && (
          <section className="card">
            <h2>Historique</h2>
            <p>Utilise les boutons S-1 / S+1 depuis l'accueil pour consulter ou préparer une autre semaine.</p>
          </section>
        )}
      </main>
    </div>
  );
}

function TodayView({ selectedWeekStart, moveWeek, totals, period, saveContext, suppliers, statuses, supplierProgress, setSelectedSupplier, setView }) {
  return (
    <>
      <section className="card hero">
        <div className="weekbar">
          <button className="secondary" onClick={() => moveWeek(-1)}>← S-1</button>
          <strong>Semaine du {formatDateFr(selectedWeekStart)}</strong>
          <button className="secondary" onClick={() => moveWeek(0)}>Aujourd'hui</button>
          <button className="secondary" onClick={() => moveWeek(1)}>S+1 →</button>
        </div>

        <h2>Aujourd’hui</h2>
        <div className="quick-stats">
          <div><strong>{totals.checked}/{totals.total}</strong><span>produits vérifiés</span></div>
          <div><strong>{totals.ordered}</strong><span>lignes à commander</span></div>
          <div><strong>{totals.doneSuppliers}/{suppliers.length}</strong><span>fournisseurs passés</span></div>
        </div>
        <div className="progress"><span style={{ width: totals.pct + '%' }} /></div>
      </section>

      <section className="card">
        <h2>Contexte semaine</h2>
        <div className="context-grid">
          <label>Coefficient activité
            <input type="number" step="0.05" value={period?.activity_coef || 1} onChange={(e) => saveContext({ activity_coef: Number(e.target.value || 1) })}/>
          </label>
          <label>Note météo / réservations
            <input value={period?.note || ''} onChange={(e) => saveContext({ note: e.target.value })} placeholder="Ex : beau temps, grosse semaine..."/>
          </label>
        </div>
      </section>

      <section className="card">
        <h2>Suivi fournisseurs</h2>
        <div className="supplier-grid">
          {suppliers.map(s => {
            const st = statuses[s.id];
            const p = supplierProgress(s.id);
            return (
              <button key={s.id} className={'supplier-card ' + statusClass(st)} onClick={() => { setSelectedSupplier(s.id); setView('orders'); }}>
                <strong>{s.name}</strong>
                <span>{p.total} produits</span>
                <span>{p.checked} vérifiés · {p.ordered} à commander</span>
                <em>{statusLabel(st)}</em>
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}

function SupplierTabs({ suppliers, selectedSupplier, setSelectedSupplier, allProducts, setAllProducts }) {
  return (
    <div className="supplier-tabs">
      <button className={allProducts ? 'active' : ''} onClick={() => setAllProducts(true)}>Tous les produits</button>
      {suppliers.map(s => (
        <button key={s.id} className={!allProducts && selectedSupplier === s.id ? 'active' : ''} onClick={() => { setAllProducts(false); setSelectedSupplier(s.id); }}>
          {s.name}
        </button>
      ))}
    </div>
  );
}

function WorkView(props) {
  const { mode, suppliers, products, allProducts, setAllProducts, selectedSupplier, setSelectedSupplier, search, setSearch, items, previousItems, historyItems, saveItem, resetInventoryChecks, statuses, saveStatus, copyOrder, resetSupplierOrder, period } = props;
  const supplier = suppliers.find(s => s.id === selectedSupplier);
  const status = statuses?.[selectedSupplier];

  return (
    <>
      <section className="card sticky">
        <div className="split">
          <div>
            <h2>{mode === 'inventory' ? 'Inventaire' : allProducts ? 'Commandes — tous les produits' : `Commande — ${supplier?.name || ''}`}</h2>
            <p>{mode === 'inventory' ? 'Saisis les stocks et coche les produits vérifiés.' : 'Stock, historique, suggestion et quantité à commander.'}</p>
          </div>
          <div className="actions">
            {mode === 'inventory' && <button className="secondary" onClick={resetInventoryChecks}>↺ Coches</button>}
            {mode === 'orders' && !allProducts && <>
              <button className="secondary" onClick={copyOrder}><Send size={16}/>Copier</button>
              <button className={status?.prepared ? 'ok' : 'secondary'} onClick={() => saveStatus(selectedSupplier, { prepared: !status?.prepared })}>{status?.prepared ? '✓ Préparée' : 'Préparée'}</button>
              <button className={status?.passed ? 'ok' : 'secondary'} onClick={() => { const next = !status?.passed; const modePass = next ? prompt('Mode de passage ? (mail, téléphone, portail...)', status?.passed_mode || '') : null; saveStatus(selectedSupplier, { passed: next, passed_mode: modePass }); }}>{status?.passed ? '✓ Passée' : 'Passée'}</button>
              <button className="danger" onClick={resetSupplierOrder}>↺ Commande</button>
            </>}
          </div>
        </div>

        {mode === 'orders' && !allProducts && (
          <div className="supplier-status-line">
            <span>Préparée : <strong>{status?.prepared ? 'oui' : 'non'}</strong></span>
            <span>Passée : <strong>{status?.passed ? 'oui' : 'non'}</strong></span>
            {status?.passed_at && <span>{new Date(status.passed_at).toLocaleString('fr-FR')}</span>}
            {status?.passed_mode && <span>{status.passed_mode}</span>}
          </div>
        )}

        <SupplierTabs suppliers={suppliers} selectedSupplier={selectedSupplier} setSelectedSupplier={setSelectedSupplier} allProducts={allProducts} setAllProducts={setAllProducts}/>
        <div className="search-wrap"><Search size={18}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un produit..."/></div>
      </section>

      <section>
        {products.map(p => <ProductCard key={p.id} mode={mode} product={p} item={items[p.id] || {}} previous={previousItems[p.id] || {}} history={historyItems?.[p.id] || []} coef={Number(period?.activity_coef || 1)} saveItem={saveItem}/>)}
      </section>
    </>
  );
}

function ProductCard({ mode, product, item, previous, history, coef, saveItem }) {
  const last = Number(previous.quantity_ordered || 0);
  const stock = Number(item.stock_current || 0);
  const values = history.map(h => Number(h.quantity_ordered || 0)).filter(Boolean);
  const avg = values.length ? Math.round((values.reduce((a,b)=>a+b,0)/values.length)*10)/10 : null;
  const base = avg || last || 0;
  const suggestion = Math.max(0, Math.round((base * coef - stock) * 10) / 10);

  return (
    <article className={'product-card ' + (item.inventory_checked ? 'checked' : '')}>
      <div className="product-head">
        <h3>{product.name}</h3>
        <button className={item.inventory_checked ? 'verify done' : 'verify'} onClick={() => saveItem(product.id, { inventory_checked: !item.inventory_checked })}>
          {item.inventory_checked ? <CheckCircle2 size={20}/> : <Circle size={20}/>}
        </button>
      </div>

      <div className={mode === 'inventory' ? 'fields inventory-fields' : 'fields'}>
        <label>Stock actuel
          <input type="number" inputMode="decimal" value={item.stock_current ?? ''} onChange={(e) => saveItem(product.id, { stock_current: e.target.value })}/>
        </label>

        <div className="metric"><span>Semaine dernière</span><strong>{last || '-'}</strong></div>

        {mode === 'orders' && <>
          <div className="metric"><span>Moy. 4 sem.</span><strong>{avg || '-'}</strong></div>
          <div className="metric"><span>Suggestion</span><strong>{suggestion || '-'}</strong></div>

          <label>À commander
            <input type="number" inputMode="decimal" value={item.quantity_ordered ?? ''} onChange={(e) => saveItem(product.id, { quantity_ordered: e.target.value })}/>
          </label>
          <label className="wide">Note
            <input value={item.note || ''} onChange={(e) => saveItem(product.id, { note: e.target.value })} placeholder="Info fournisseur, qualité, ajustement..."/>
          </label>
        </>}
      </div>
    </article>
  );
}

createRoot(document.getElementById('root')).render(<App />);

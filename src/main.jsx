
import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import { CheckCircle2, Circle, ClipboardList, Home, History, Package, Search, Send, Settings, RefreshCcw } from 'lucide-react';
import './styles.css';
import { seedData } from './seedData.js';

const SUPABASE_URL = 'https://jajhwtwaxqemxmtamhoo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_eMi46zoTzfHn1Z19g06BTw_WpQ5rzPL';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function mondayOfWeek(date = new Date()) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}


function isRealProductName(name) {
  const n = String(name || '').trim().toLowerCase();
  if (!n) return false;
  const bad = [
    'nombre de produits', 'jour de livraison', 'jours de livraison', 'livraison',
    'commande pour', 'à commander', 'a commander', 'fournisseur', 'produit',
    'stock actuel', 'semaine passée', 'semaine passee', 'suggestion',
    'note', 'info :', 'infos :', 'information', 'informations'
  ];
  if (bad.some(b => n.includes(b))) return false;
  if (/^\d+\s*produits?$/.test(n)) return false;
  if (/^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/.test(n)) return false;
  if (n.length < 2) return false;
  return true;
}

function statusLabel(status) {
  if (!status) return 'À préparer';
  if (status.prepared && status.passed) return 'Passée';
  if (status.prepared) return 'Préparée';
  return 'À préparer';
}

function statusClass(status) {
  if (status?.prepared && status?.passed) return 'passed';
  if (status?.prepared) return 'prepared';
  return 'draft';
}

function todayName() {
  return new Date().toLocaleDateString('fr-FR', { weekday: 'long' }).toLowerCase();
}

function App() {
  const [view, setView] = useState('today');
  const [loading, setLoading] = useState(true);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [period, setPeriod] = useState(null);
  const [items, setItems] = useState({});
  const [previousItems, setPreviousItems] = useState({});
  const [historicalItems, setHistoricalItems] = useState({});
  const [statuses, setStatuses] = useState({});
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [allProducts, setAllProducts] = useState(false);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [selectedWeekStart, setSelectedWeekStart] = useState(mondayOfWeek());

  async function ensureSeed() {
    const { data, error } = await supabase.from('suppliers').select('id').limit(1);
    if (error) throw error;
    if (data?.length) return;

    for (const s of seedData) {
      const isTerre = /terre/i.test(s.supplier);
      const isSensitive = /terre|passion|brosset|boulanger/i.test(s.supplier);
      const { data: supplier, error: supplierError } = await supabase
        .from('suppliers')
        .insert({
          name: s.supplier,
          sensitive: isSensitive,
          order_days: isTerre ? ['dimanche', 'mercredi'] : ['dimanche'],
          delivery_days: isTerre ? ['mardi', 'jeudi', 'samedi'] : []
        })
        .select()
        .single();
      if (supplierError) throw supplierError;

      const rows = s.products.map((name, index) => ({
        supplier_id: supplier.id,
        name,
        sort_order: index + 1,
        active: true
      }));
      const { error: productsError } = await supabase.from('products').insert(rows);
      if (productsError) throw productsError;
    }
  }

  async function loadAll(weekStartOverride = selectedWeekStart) {
    setLoading(true);
    setMessage('Chargement...');
    await ensureSeed();

    const suppliersRes = await supabase.from('suppliers').select('*').order('name');
    if (suppliersRes.error) throw suppliersRes.error;

    const productsRes = await supabase.from('products').select('*').eq('active', true).order('sort_order');
    if (productsRes.error) throw productsRes.error;

    const weekStart = weekStartOverride || mondayOfWeek();
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

    const statusRes = await supabase.from('supplier_order_statuses').select('*').eq('period_id', currentPeriod.id);
    if (statusRes.error) throw statusRes.error;

    const previousPeriodRes = await supabase
      .from('supply_periods')
      .select('*')
      .lt('period_start', currentPeriod.period_start)
      .order('period_start', { ascending: false })
      .limit(1);

    let prev = {};
    let hist = {};
    if (!previousPeriodRes.error && previousPeriodRes.data?.length) {
      const prevItems = await supabase.from('supply_items').select('*').eq('period_id', previousPeriodRes.data[0].id);
      if (!prevItems.error) {
        prevItems.data?.forEach((item) => {
          prev[item.product_id] = item;
        });
      }
    }

    const lastPeriodsRes = await supabase
      .from('supply_periods')
      .select('*')
      .lt('period_start', currentPeriod.period_start)
      .order('period_start', { ascending: false })
      .limit(4);

    if (!lastPeriodsRes.error && lastPeriodsRes.data?.length) {
      const periodIds = lastPeriodsRes.data.map((p) => p.id);
      const histItems = await supabase.from('supply_items').select('*').in('period_id', periodIds);
      if (!histItems.error) {
        histItems.data?.forEach((item) => {
          if (!hist[item.product_id]) hist[item.product_id] = [];
          hist[item.product_id].push(item);
        });
      }
    }

    const supplierList = suppliersRes.data || [];
    setSuppliers(supplierList);
    setProducts((productsRes.data || []).filter((p) => isRealProductName(p.name)));
    setPeriod(currentPeriod);
    setItems(Object.fromEntries((itemsRes.data || []).map((item) => [item.product_id, item])));
    setPreviousItems(prev);
    setHistoricalItems(hist);
    setStatuses(Object.fromEntries((statusRes.data || []).map((status) => [status.supplier_id, status])));
    setSelectedSupplier((old) => old || supplierList[0]?.id || null);
    setLoading(false);
    setMessage('Sauvegarde automatique active');
  }

  useEffect(() => {
    loadAll(selectedWeekStart).catch((error) => {
      console.error(error);
      setLoading(false);
      setMessage('Erreur : ' + error.message);
    });
  }, [selectedWeekStart]);

  const selectedProducts = useMemo(() => {
    let list = allProducts ? products : products.filter((p) => p.supplier_id === selectedSupplier);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    return list;
  }, [products, allProducts, selectedSupplier, search]);

  function supplierProducts(supplierId) {
    return products.filter((p) => p.supplier_id === supplierId);
  }

  function supplierProgress(supplierId) {
    const list = supplierProducts(supplierId);
    const checked = list.filter((p) => items[p.id]?.inventory_checked).length;
    const ordered = list.filter((p) => items[p.id]?.quantity_ordered).length;
    return { total: list.length, checked, ordered };
  }

  async function saveItem(productId, patch) {
    const existing = items[productId] || { period_id: period.id, product_id: productId };
    const updated = { ...existing, ...patch, updated_at: new Date().toISOString() };
    setItems((prev) => ({ ...prev, [productId]: updated }));

    const payload = {
      period_id: period.id,
      product_id: productId,
      stock_current: updated.stock_current === '' ? null : updated.stock_current,
      quantity_ordered: updated.quantity_ordered === '' ? null : updated.quantity_ordered,
      note: updated.note || null,
      inventory_checked: !!updated.inventory_checked,
      updated_at: updated.updated_at
    };

    const { error } = await supabase.from('supply_items').upsert(payload, { onConflict: 'period_id,product_id' });
    if (error) setMessage('Erreur sauvegarde : ' + error.message);
    else setMessage('Sauvegardé');
  }

  async function saveSupplierStatus(supplierId, patch) {
    const existing = statuses[supplierId] || { period_id: period.id, supplier_id: supplierId };
    const now = new Date().toISOString();
    const updated = { ...existing, ...patch, updated_at: now };
    if ('prepared' in patch && patch.prepared) updated.prepared_at = now;
    if ('passed' in patch && patch.passed) updated.passed_at = now;
    setStatuses((prev) => ({ ...prev, [supplierId]: updated }));

    const payload = {
      period_id: period.id,
      supplier_id: supplierId,
      prepared: !!updated.prepared,
      passed: !!updated.passed,
      prepared_at: updated.prepared_at || null,
      passed_at: updated.passed_at || null,
      passed_mode: updated.passed_mode || null,
      note: updated.note || null,
      updated_at: now
    };

    const { error } = await supabase.from('supplier_order_statuses').upsert(payload, { onConflict: 'period_id,supplier_id' });
    if (error) setMessage('Erreur statut : ' + error.message);
    else setMessage('Statut fournisseur sauvegardé');
  }

  async function saveContext(patch) {
    const updated = { ...period, ...patch };
    setPeriod(updated);
    const { error } = await supabase.from('supply_periods').update(patch).eq('id', period.id);
    if (error) setMessage('Erreur contexte : ' + error.message);
    else setMessage('Contexte sauvegardé');
  }

  async function resetInventoryChecks() {
    if (!confirm('Décocher tous les produits vérifiés pour cette période ?')) return;
    for (const item of Object.values(items)) {
      if (item.inventory_checked) await saveItem(item.product_id, { inventory_checked: false });
    }
  }

  function copyOrder() {
    const supplier = suppliers.find((s) => s.id === selectedSupplier);
    const lines = supplierProducts(selectedSupplier)
      .map((p) => [p, items[p.id]])
      .filter(([, item]) => item?.quantity_ordered)
      .map(([p, item]) => `- ${p.name} : ${item.quantity_ordered}${item.note ? ' (' + item.note + ')' : ''}`);

    if (!lines.length) return alert('Aucune quantité à commander pour ce fournisseur.');

    const text = `Bonjour,\n\nVoici notre commande ${supplier?.name || ''} :\n\n${lines.join('\n')}\n\nMerci.`;
    navigator.clipboard.writeText(text);
    alert('Commande copiée.');
  }

  const reminders = useMemo(() => {
    const day = todayName();
    const result = [];
    suppliers.forEach((s) => {
      const status = statuses[s.id];
      const shouldOrder = (s.order_days || []).map((d) => String(d).toLowerCase()).includes(day);
      const progress = supplierProgress(s.id);
      if (shouldOrder && !status?.passed) {
        result.push({ level: 'urgent', title: `Commande à passer : ${s.name}`, text: status?.prepared ? 'Préparée, mais pas encore passée.' : 'À préparer ou vérifier.' });
      }
      if (status?.prepared && !status?.passed) {
        result.push({ level: 'warn', title: `${s.name} préparée mais pas passée`, text: 'Pense à envoyer la commande.' });
      }
      if (s.sensitive && progress.ordered === 0) {
        result.push({ level: 'info', title: `À surveiller : ${s.name}`, text: 'Fournisseur sensible / ajustement possible.' });
      }
    });
    return result.slice(0, 8);
  }, [suppliers, statuses, items, products]);


  function moveWeek(delta) {
    const d = new Date(selectedWeekStart);
    d.setDate(d.getDate() + delta * 7);
    setSelectedWeekStart(d.toISOString().slice(0, 10));
  }

  function goCurrentWeek() {
    setSelectedWeekStart(mondayOfWeek());
  }

  async function resetSupplierOrder() {
    if (!selectedSupplier) return;
    if (!confirm('Réinitialiser les quantités à commander pour ce fournisseur sur cette semaine ?')) return;
    const list = supplierProducts(selectedSupplier);
    for (const product of list) {
      const item = items[product.id];
      if (item?.quantity_ordered || item?.note) {
        await saveItem(product.id, { quantity_ordered: null, note: item.note || null });
      }
    }
    await saveSupplierStatus(selectedSupplier, { prepared: false, passed: false, prepared_at: null, passed_at: null, passed_mode: null });
  }

  if (loading) return <div className="loading">Chargement de Brigade 1959...</div>;

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>Brigade 1959</h1>
          <p>{message}</p>
        </div>
        <button className="secondary" onClick={() => loadAll(selectedWeekStart)}><RefreshCcw size={18} /> Actualiser</button>
      </header>

      <nav className="nav">
        <button className={view === 'today' ? 'active' : ''} onClick={() => setView('today')}><Home size={18} /> Aujourd’hui</button>
        <button className={view === 'inventory' ? 'active' : ''} onClick={() => setView('inventory')}><ClipboardList size={18} /> Inventaire</button>
        <button className={view === 'orders' ? 'active' : ''} onClick={() => setView('orders')}><Package size={18} /> Commandes</button>
        <button className={view === 'history' ? 'active' : ''} onClick={() => setView('history')}><History size={18} /> Historique</button>
      </nav>

      <main>
        {view === 'today' && (
          <TodayView
            reminders={reminders}
            period={period}
            selectedWeekStart={selectedWeekStart}
            moveWeek={moveWeek}
            goCurrentWeek={goCurrentWeek}
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
            products={selectedProducts}
            allProducts={allProducts}
            setAllProducts={setAllProducts}
            selectedSupplier={selectedSupplier}
            setSelectedSupplier={setSelectedSupplier}
            search={search}
            setSearch={setSearch}
            items={items}
            previousItems={previousItems}
            historicalItems={historicalItems}
            saveItem={saveItem}
            resetInventoryChecks={resetInventoryChecks}
          />
        )}

        {view === 'orders' && (
          <WorkView
            mode="orders"
            suppliers={suppliers}
            products={selectedProducts}
            allProducts={allProducts}
            setAllProducts={setAllProducts}
            selectedSupplier={selectedSupplier}
            setSelectedSupplier={setSelectedSupplier}
            search={search}
            setSearch={setSearch}
            items={items}
            previousItems={previousItems}
            historicalItems={historicalItems}
            saveItem={saveItem}
            period={period}
            statuses={statuses}
            saveSupplierStatus={saveSupplierStatus}
            copyOrder={copyOrder}
            resetSupplierOrder={resetSupplierOrder}
          />
        )}

        {view === 'history' && <HistoryView period={period} />}
      </main>
    </div>
  );
}

function TodayView({ reminders, period, selectedWeekStart, moveWeek, goCurrentWeek, saveContext, suppliers, statuses, supplierProgress, setSelectedSupplier, setView }) {
  const totals = suppliers.reduce((acc, s) => { const p = supplierProgress(s.id); acc.total += p.total; acc.checked += p.checked; acc.ordered += p.ordered; return acc; }, { total: 0, checked: 0, ordered: 0 });
  const checkedPct = totals.total ? Math.round((totals.checked / totals.total) * 100) : 0;
  return (
    <>
      <section className="card">
        <div className="weekbar">
          <button className="secondary" onClick={() => moveWeek(-1)}>← Semaine précédente</button>
          <strong>Semaine du {new Date(selectedWeekStart).toLocaleDateString('fr-FR')}</strong>
          <button className="secondary" onClick={goCurrentWeek}>Semaine actuelle</button>
          <button className="secondary" onClick={() => moveWeek(1)}>Semaine suivante →</button>
        </div>
        <h2>Aujourd’hui</h2>
        <div className="quick-stats">
          <div><strong>{checkedPct}%</strong><span>inventaire</span></div>
          <div><strong>{totals.checked}/{totals.total}</strong><span>vérifiés</span></div>
          <div><strong>{totals.ordered}</strong><span>lignes commande</span></div>
        </div>
        <div className="progress"><span style={{ width: checkedPct + '%' }} /></div>
        <div className="reminders">
          {reminders.length ? reminders.map((r, index) => (
            <div key={index} className={`reminder ${r.level}`}>
              <strong>{r.title}</strong>
              <span>{r.text}</span>
            </div>
          )) : <p>Aucun rappel urgent.</p>}
        </div>
      </section>

      <section className="card">
        <h2>Contexte semaine</h2>
        <div className="context-grid">
          <label>Coefficient activité
            <input type="number" step="0.05" value={period?.activity_coef || 1} onChange={(e) => saveContext({ activity_coef: Number(e.target.value || 1) })} />
          </label>
          <label>Note météo / réservations
            <input value={period?.note || ''} onChange={(e) => saveContext({ note: e.target.value })} placeholder="Ex : beau temps, grosse semaine..." />
          </label>
        </div>
      </section>

      <section className="card">
        <h2>Suivi fournisseurs</h2>
        <div className="supplier-grid">
          {suppliers.map((s) => {
            const status = statuses[s.id];
            const progress = supplierProgress(s.id);
            return (
              <button className="supplier-card" key={s.id} onClick={() => { setSelectedSupplier(s.id); setView('orders'); }}>
                <strong>{s.name}</strong>
                <small>{progress.checked}/{progress.total} vérifiés · {progress.ordered} lignes commandées</small>
                <span className={`pill ${statusClass(status)}`}>{statusLabel(status)}</span>
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
      {suppliers.map((s) => (
        <button
          key={s.id}
          className={!allProducts && selectedSupplier === s.id ? 'active' : ''}
          onClick={() => { setAllProducts(false); setSelectedSupplier(s.id); }}
        >
          {s.name}
        </button>
      ))}
    </div>
  );
}

function WorkView(props) {
  const {
    mode, suppliers, products, allProducts, setAllProducts, selectedSupplier, setSelectedSupplier,
    search, setSearch, items, previousItems, historicalItems, saveItem, resetInventoryChecks, period,
    statuses, saveSupplierStatus, copyOrder, resetSupplierOrder
  } = props;

  const supplier = suppliers.find((s) => s.id === selectedSupplier);
  const status = statuses?.[selectedSupplier];

  return (
    <>
      <section className="card sticky">
        <div className="split">
          <div>
            <h2>{mode === 'inventory' ? 'Inventaire' : (allProducts ? 'Commandes — tous les produits' : `Commande — ${supplier?.name || ''}`)}</h2>
            <p>{mode === 'inventory' ? 'Stock actuel + coche vérifié.' : 'Stock, dernière commande, suggestion, à commander.'}</p>
          </div>
          <div className="actions">
            {mode === 'inventory' && <button className="secondary" onClick={resetInventoryChecks}>Réinitialiser coches</button>}
            {mode === 'orders' && !allProducts && (
              <>
                <button className="secondary" onClick={copyOrder}><Send size={16} /> Copier</button>
                <button className={status?.prepared ? 'ok' : 'secondary'} onClick={() => saveSupplierStatus(selectedSupplier, { prepared: !status?.prepared })}>
                  {status?.prepared ? '✓ Préparée' : 'Marquer préparée'}
                </button>
                <button className={status?.passed ? 'ok' : 'secondary'} onClick={() => { const next = !status?.passed; const mode = next ? prompt('Mode de passage ? (mail, téléphone, portail...)', status?.passed_mode || '') : null; saveSupplierStatus(selectedSupplier, { passed: next, passed_mode: mode }); }}>
                  {status?.passed ? '✓ Passée' : 'Marquer passée'}
                </button>
                <button className="danger" onClick={resetSupplierOrder}>Réinitialiser commande</button>
              </>
            )}
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
        <SupplierTabs suppliers={suppliers} selectedSupplier={selectedSupplier} setSelectedSupplier={setSelectedSupplier} allProducts={allProducts} setAllProducts={setAllProducts} />

        <div className="search-wrap">
          <Search size={18} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un produit..." />
        </div>
      </section>

      <section>
        {products.map((p) => (
          <ProductCard
            key={p.id}
            product={p}
            mode={mode}
            item={items[p.id] || {}}
            previous={previousItems[p.id] || {}}
            history={historicalItems?.[p.id] || []}
            coef={Number(period?.activity_coef || 1)}
            saveItem={saveItem}
          />
        ))}
      </section>
    </>
  );
}

function ProductCard({ product, mode, item, previous, history = [], coef, saveItem }) {
  const last = Number(previous.quantity_ordered || 0);
  const stock = Number(item.stock_current || 0);
  const suggestion = Math.max(0, Math.round(last * coef - stock));
  const consumed = last && stock >= 0 ? Math.max(0, last - stock) : null;
  const historyValues = history.map((h) => Number(h.quantity_ordered || 0)).filter(Boolean);
  const avg4 = historyValues.length ? Math.round((historyValues.reduce((a,b)=>a+b,0) / historyValues.length) * 10) / 10 : null;

  return (
    <article className="product-card">
      <div className="product-head">
        <div>
          <h3>{product.name}</h3>
          {mode === 'orders' && consumed !== null && <small>Consommé estimé : {consumed}</small>}
        </div>
        <button
          className={item.inventory_checked ? 'verify done' : 'verify'}
          onClick={() => saveItem(product.id, { inventory_checked: !item.inventory_checked })}
        >
          {item.inventory_checked ? <CheckCircle2 size={20} /> : <Circle size={20} />}
        </button>
      </div>

      <div className={mode === 'inventory' ? 'fields inventory-fields' : 'fields'}>
        <label>Stock actuel
          <input type="number" inputMode="decimal" value={item.stock_current ?? ''} onChange={(e) => saveItem(product.id, { stock_current: e.target.value })} />
        </label>

        <div className="metric">
          <span>Semaine dernière</span>
          <strong>{last || '-'}</strong>
        </div>

        {mode === 'orders' && (
          <>
            <div className="metric">
              <span>Moy. 4 sem.</span>
              <strong>{avg4 || '-'}</strong>
            </div>

            <div className="metric">
              <span>Suggestion</span>
              <strong>{suggestion || '-'}</strong>
            </div>

            <label>À commander
              <input type="number" inputMode="decimal" value={item.quantity_ordered ?? ''} onChange={(e) => saveItem(product.id, { quantity_ordered: e.target.value })} />
            </label>

            <label className="wide">Note
              <input value={item.note || ''} onChange={(e) => saveItem(product.id, { note: e.target.value })} placeholder="Qualité, ajustement, info fournisseur..." />
            </label>
          </>
        )}
      </div>
    </article>
  );
}

function HistoryView() {
  return (
    <section className="card">
      <h2>Historique</h2>
      <p>La base enregistre déjà les périodes, les stocks, les quantités commandées et les statuts fournisseur. L’affichage détaillé sera amélioré en V2.1.</p>
    </section>
  );
}

createRoot(document.getElementById('root')).render(<App />);

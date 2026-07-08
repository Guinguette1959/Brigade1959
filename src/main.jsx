
import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import { Home, ClipboardList, Package, History, RefreshCcw, Search, CheckCircle2, Circle, Send, Settings, Plus, EyeOff, Eye, Square, CheckSquare, Edit3, ArrowLeft } from 'lucide-react';
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


function datesOfWeek(weekStart) {
  const base = new Date(weekStart);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

function shortDay(dateString) {
  return new Date(dateString).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' });
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
  if (status?.prepared && status?.passed) return 'Commande passée';
  if (status?.prepared) return 'Commande préparée';
  return 'À préparer';
}
function statusClass(status) {
  if (status?.prepared && status?.passed) return 'passed';
  if (status?.prepared) return 'prepared';
  return 'draft';
}

function App() {
  const [view, setView] = useState('today');
  const [previousView, setPreviousView] = useState(null);
  const [compactHeader, setCompactHeader] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('Chargement...');
  const [selectedWeekStart, setSelectedWeekStart] = useState(mondayOfWeek());
  const [selectedDeliveryDate, setSelectedDeliveryDate] = useState(mondayOfWeek());
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
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newProductName, setNewProductName] = useState('');
  const [newProductSupplierId, setNewProductSupplierId] = useState('');

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

  async function loadAll(weekStart = selectedWeekStart, deliveryDate = selectedDeliveryDate) {
    setLoading(true);
    setMessage('Chargement...');
    await ensureSeed();

    const sRes = await supabase.from('suppliers').select('*').order('name');
    if (sRes.error) throw sRes.error;

    const pRes = await supabase.from('products').select('*').order('sort_order');
    if (pRes.error) throw pRes.error;

    let periodRes = await supabase.from('supply_periods').select('*').eq('period_start', weekStart).maybeSingle();
    if (periodRes.error) throw periodRes.error;

    let currentPeriod = periodRes.data;
    if (!currentPeriod) {
      const created = await supabase.from('supply_periods').insert({ period_start: weekStart, activity_coef: 1, note: '' }).select().single();
      if (created.error) throw created.error;
      currentPeriod = created.data;
    }

    const itemsRes = await supabase.from('supply_items').select('*').eq('period_id', currentPeriod.id).eq('delivery_date', deliveryDate);
    if (itemsRes.error) throw itemsRes.error;

    const statusesRes = await supabase.from('supplier_order_statuses').select('*').eq('period_id', currentPeriod.id).eq('delivery_date', deliveryDate);
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
    setNewProductSupplierId(old => old || sRes.data?.[0]?.id || null);
    setMessage('Sauvegarde automatique active');
    setLoading(false);
  }

  useEffect(() => {
    setSelectedDeliveryDate(selectedWeekStart);
    loadAll(selectedWeekStart, selectedWeekStart).catch(error => {
      console.error(error);
      setMessage('Erreur : ' + error.message);
      setLoading(false);
    });
  }, [selectedWeekStart]);

  useEffect(() => {
    if (!period) return;
    loadOrderDataForDelivery(selectedDeliveryDate).catch(error => {
      console.error(error);
      setMessage('Erreur livraison : ' + error.message);
    });
  }, [selectedDeliveryDate]);

  useEffect(() => {
    const onScroll = () => setCompactHeader(window.scrollY > 120);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  function navigate(nextView) {
    if (nextView === view) return;
    setPreviousView(view);
    setView(nextView);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function goBack() {
    if (!previousView) return;
    const current = view;
    setView(previousView);
    setPreviousView(current);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }



  const filteredProducts = useMemo(() => {
    let list = allProducts ? products.filter(p => p.active !== false) : products.filter(p => p.active !== false && p.supplier_id === selectedSupplier);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(p => p.name.toLowerCase().includes(q));
    return list;
  }, [products, allProducts, selectedSupplier, search]);

  function supplierProducts(supplierId) {
    return products.filter(p => p.active !== false && p.supplier_id === supplierId);
  }

  function supplierProgress(supplierId) {
    const list = supplierProducts(supplierId);
    return {
      total: list.length,
      checked: list.filter(p => items[p.id]?.inventory_checked).length,
      ordered: list.filter(p => Number(items[p.id]?.quantity_ordered || 0) > 0).length
    };
  }


  async function loadOrderDataForDelivery(deliveryDate) {
    if (!period) return;
    const itemsRes = await supabase.from('supply_items').select('*').eq('period_id', period.id).eq('delivery_date', deliveryDate);
    if (itemsRes.error) throw itemsRes.error;
    const statusesRes = await supabase.from('supplier_order_statuses').select('*').eq('period_id', period.id).eq('delivery_date', deliveryDate);
    if (statusesRes.error) throw statusesRes.error;
    setItems(Object.fromEntries((itemsRes.data || []).map(i => [i.product_id, i])));
    setStatuses(Object.fromEntries((statusesRes.data || []).map(s => [s.supplier_id, s])));
    setMessage('Livraison chargée : ' + formatDateFr(deliveryDate));
  }

  async function saveItem(productId, patch) {
    const existing = items[productId] || { period_id: period.id, product_id: productId, delivery_date: selectedDeliveryDate };
    const updated = { ...existing, ...patch, updated_at: new Date().toISOString() };
    setItems(prev => ({ ...prev, [productId]: updated }));

    const payload = {
      period_id: period.id,
      product_id: productId,
      delivery_date: selectedDeliveryDate,
      stock_current: updated.stock_current === '' ? null : updated.stock_current,
      quantity_ordered: updated.quantity_ordered === '' ? null : updated.quantity_ordered,
      note: updated.note || null,
      inventory_checked: !!updated.inventory_checked,
      updated_at: updated.updated_at
    };
    const res = await supabase.from('supply_items').upsert(payload, { onConflict:'period_id,product_id,delivery_date' });
    if (res.error) setMessage('Erreur sauvegarde : ' + res.error.message);
    else setMessage('Sauvegardé');
  }

  async function saveStatus(supplierId, patch) {
    const existing = statuses[supplierId] || { period_id: period.id, supplier_id: supplierId, delivery_date: selectedDeliveryDate };
    const now = new Date().toISOString();
    const updated = { ...existing, ...patch, updated_at: now };
    if ('prepared' in patch && patch.prepared) updated.prepared_at = now;
    if ('passed' in patch && patch.passed) updated.passed_at = now;
    setStatuses(prev => ({ ...prev, [supplierId]: updated }));

    const res = await supabase.from('supplier_order_statuses').upsert({
      period_id: period.id,
      supplier_id: supplierId,
      delivery_date: selectedDeliveryDate,
      prepared: !!updated.prepared,
      passed: !!updated.passed,
      prepared_at: updated.prepared_at || null,
      passed_at: updated.passed_at || null,
      passed_mode: updated.passed_mode || null,
      note: updated.note || null,
      updated_at: now
    }, { onConflict:'period_id,supplier_id,delivery_date' });
    if (res.error) setMessage('Erreur statut : ' + res.error.message);
    else setMessage('Statut sauvegardé');
  }

  async function saveContext(patch) {
    setPeriod(prev => ({ ...prev, ...patch }));
    const res = await supabase.from('supply_periods').update(patch).eq('id', period.id);
    if (res.error) setMessage('Erreur contexte : ' + res.error.message);
    else setMessage('Contexte sauvegardé');
  }


  async function addSupplier() {
    const name = newSupplierName.trim();
    if (!name) return alert('Nom du fournisseur manquant.');
    const res = await supabase.from('suppliers').insert({ name, order_days: [], delivery_days: [] }).select().single();
    if (res.error) return alert('Erreur fournisseur : ' + res.error.message);
    setNewSupplierName('');
    await loadAll(selectedWeekStart);
    setSelectedSupplier(res.data.id);
    setNewProductSupplierId(res.data.id);
    setMessage('Fournisseur ajouté');
  }

  async function addProduct() {
    const name = newProductName.trim();
    const supplierId = newProductSupplierId || selectedSupplier;
    if (!supplierId) return alert('Choisis un fournisseur.');
    if (!name) return alert('Nom du produit manquant.');
    const count = products.filter(p => p.supplier_id === supplierId).length;
    const res = await supabase.from('products').insert({
      supplier_id: supplierId,
      name,
      sort_order: count + 1,
      active: true
    }).select().single();
    if (res.error) return alert('Erreur produit : ' + res.error.message);
    setNewProductName('');
    await loadAll(selectedWeekStart);
    setMessage('Produit ajouté');
  }

  async function toggleProductActive(productId, active) {
    const res = await supabase.from('products').update({ active }).eq('id', productId);
    if (res.error) return alert('Erreur produit : ' + res.error.message);
    await loadAll(selectedWeekStart);
    setMessage(active ? 'Produit réactivé' : 'Produit masqué');
  }

  async function bulkSetProductsActive(productIds, active) {
    if (!productIds.length) return alert('Aucun produit sélectionné.');
    const res = await supabase.from('products').update({ active }).in('id', productIds);
    if (res.error) return alert('Erreur produits : ' + res.error.message);
    await loadAll(selectedWeekStart);
    setMessage(active ? 'Produits réactivés' : 'Produits masqués');
  }

  async function renameProduct(productId, currentName) {
    const name = prompt('Nouveau nom du produit :', currentName);
    if (!name || !name.trim()) return;
    const res = await supabase.from('products').update({ name: name.trim() }).eq('id', productId);
    if (res.error) return alert('Erreur renommage : ' + res.error.message);
    await loadAll(selectedWeekStart);
    setMessage('Produit renommé');
  }

  async function renameSupplier(supplierId, currentName) {
    const name = prompt('Nouveau nom du fournisseur :', currentName);
    if (!name || !name.trim()) return;
    const res = await supabase.from('suppliers').update({ name: name.trim() }).eq('id', supplierId);
    if (res.error) return alert('Erreur renommage fournisseur : ' + res.error.message);
    await loadAll(selectedWeekStart);
    setMessage('Fournisseur renommé');
  }


  async function resetInventoryChecks() {
    if (!confirm('Décocher tous les produits vérifiés de cette semaine ?')) return;
    const res = await supabase.from('supply_items').update({ inventory_checked:false }).eq('period_id', period.id).eq('delivery_date', selectedDeliveryDate);
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

  function goCurrentWeek() {
    setSelectedWeekStart(mondayOfWeek());
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
    const activeProducts = products.filter(p => p.active !== false);
    const total = activeProducts.length;
    const checked = activeProducts.filter(p => items[p.id]?.inventory_checked).length;
    const ordered = activeProducts.filter(p => Number(items[p.id]?.quantity_ordered || 0) > 0).length;
    const doneSuppliers = suppliers.filter(s => statuses[s.id]?.passed).length;
    return { total, checked, ordered, doneSuppliers, pct: total ? Math.round((checked/total)*100) : 0 };
  }, [products, items, suppliers, statuses]);

  if (loading) return <div className="loading">Chargement de Brigade 1959...</div>;

  return (
    <div className="app">
      <header className="topbar">
        <div className="top-left">
          <button className="back-btn" disabled={!previousView} onClick={goBack}><ArrowLeft size={18}/>Retour</button>
          <div>
            <h1>Brigade 1959 <span className="version-pill">V4.4</span></h1>
            <p>{message}</p>
          </div>
        </div>
        <button className="secondary small" onClick={() => loadAll(selectedWeekStart, selectedDeliveryDate)}><RefreshCcw size={16}/>Actualiser</button>
      </header>

      <nav className="nav">
        <button className={view === 'today' ? 'active' : ''} onClick={() => navigate('today')}><Home size={18}/>Aujourd'hui</button>
        <button className={view === 'inventory' ? 'active' : ''} onClick={() => navigate('inventory')}><ClipboardList size={18}/>Inventaire</button>
        <button className={view === 'orders' ? 'active' : ''} onClick={() => navigate('orders')}><Package size={18}/>Commandes</button>
        <button className={view === 'history' ? 'active' : ''} onClick={() => navigate('history')}><History size={18}/>Historique</button>
        <button className={view === 'manage' ? 'active' : ''} onClick={() => navigate('manage')}><Settings size={18}/>Gestion</button>
      </nav>

      <main>
        {view === 'today' && (
          <TodayView
            selectedWeekStart={selectedWeekStart}
            selectedDeliveryDate={selectedDeliveryDate}
            setSelectedDeliveryDate={setSelectedDeliveryDate}
            moveWeek={moveWeek}
            goCurrentWeek={goCurrentWeek}
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
            compactHeader={compactHeader}
            selectedWeekStart={selectedWeekStart}
            selectedDeliveryDate={selectedDeliveryDate}
            setSelectedDeliveryDate={setSelectedDeliveryDate}
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
            compactHeader={compactHeader}
            selectedWeekStart={selectedWeekStart}
            selectedDeliveryDate={selectedDeliveryDate}
            setSelectedDeliveryDate={setSelectedDeliveryDate}
          />
        )}

        {view === 'history' && (
          <section className="card">
            <h2>Historique</h2>
            <p>Les semaines précédentes restent sauvegardées. Retourne sur Aujourd'hui puis utilise S-1 ou S+1 pour consulter ou préparer une autre semaine.</p>
          </section>
        )}

        {view === 'manage' && (
          <ManageView
            suppliers={suppliers}
            products={products}
            newSupplierName={newSupplierName}
            setNewSupplierName={setNewSupplierName}
            addSupplier={addSupplier}
            newProductName={newProductName}
            setNewProductName={setNewProductName}
            newProductSupplierId={newProductSupplierId}
            setNewProductSupplierId={setNewProductSupplierId}
            addProduct={addProduct}
            toggleProductActive={toggleProductActive}
            bulkSetProductsActive={bulkSetProductsActive}
            renameProduct={renameProduct}
            renameSupplier={renameSupplier}
          />
        )}
      </main>
    </div>
  );
}


function DeliverySelector({ selectedWeekStart, selectedDeliveryDate, setSelectedDeliveryDate, compact = false }) {
  const dates = datesOfWeek(selectedWeekStart);
  return (
    <div className={compact ? "delivery-selector compact-delivery" : "delivery-selector"}>
      {dates.map(d => (
        <button key={d} className={selectedDeliveryDate === d ? 'active' : ''} onClick={() => setSelectedDeliveryDate(d)}>
          {shortDay(d)}
        </button>
      ))}
    </div>
  );
}

function TodayView({ selectedWeekStart, selectedDeliveryDate, setSelectedDeliveryDate, moveWeek, goCurrentWeek, totals, period, saveContext, suppliers, statuses, supplierProgress, setSelectedSupplier, setView }) {
  return (
    <>
      <section className="card hero">
        <div className="weekbar">
          <button className="secondary" onClick={() => moveWeek(-1)}>← S-1</button>
          <strong>Semaine du {formatDateFr(selectedWeekStart)}</strong>
          <button className="secondary" onClick={goCurrentWeek}>Aujourd'hui</button>
          <button className="secondary" onClick={() => moveWeek(1)}>S+1 →</button>
        </div>

        <h2>Aujourd’hui</h2>
        <DeliverySelector selectedWeekStart={selectedWeekStart} selectedDeliveryDate={selectedDeliveryDate} setSelectedDeliveryDate={setSelectedDeliveryDate} />
        <div className="quick-stats">
          <div><strong>{totals.checked}/{totals.total}</strong><span>produits vérifiés</span></div>
          <div><strong>{totals.ordered}</strong><span>lignes à commander</span></div>
          <div><strong>{totals.doneSuppliers}/{suppliers.length}</strong><span>fournisseurs passés</span></div>
        </div>
        <div className="progress"><span style={{ width: totals.pct + '%' }} /></div>
        <div className="action-summary">
          <div><b>Priorité</b><span>{totals.ordered > 0 ? 'Vérifier les commandes en cours' : 'Préparer les fournisseurs'}</span></div>
          <div><b>État</b><span>{totals.doneSuppliers === suppliers.length ? 'Toutes les commandes sont passées' : `${suppliers.length - totals.doneSuppliers} fournisseurs restants`}</span></div>
        </div>
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
                <div className="supplier-numbers">
                  <span><b>{p.total}</b> produits</span>
                  <span><b>{p.checked}</b> vérifiés</span>
                  <span><b>{p.ordered}</b> à commander</span>
                </div>
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
  const { mode, suppliers, products, allProducts, setAllProducts, selectedSupplier, setSelectedSupplier, search, setSearch, items, previousItems, historyItems, saveItem, resetInventoryChecks, statuses, saveStatus, copyOrder, resetSupplierOrder, period, compactHeader, selectedWeekStart, selectedDeliveryDate, setSelectedDeliveryDate } = props;
  const supplier = suppliers.find(s => s.id === selectedSupplier);
  const status = statuses?.[selectedSupplier];

  return (
    <>
      <section className={'card sticky work-toolbar ' + (compactHeader ? 'compact' : '')}>
        <div className="split">
          <div>
            <h2>{mode === 'inventory' ? 'Inventaire' : allProducts ? 'Commandes — tous les produits' : `Commande — ${supplier?.name || ''}`}</h2>
            <DeliverySelector selectedWeekStart={selectedWeekStart} selectedDeliveryDate={selectedDeliveryDate} setSelectedDeliveryDate={setSelectedDeliveryDate} compact />
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



function looksLikeFalseLine(name) {
  const low = String(name || '').toLowerCase().trim();
  if (!low) return true;
  const patterns = [
    'mardi pour mercredi', 'mercredi pour jeudi', 'mercredi pour vendredi',
    'dimanche pour lundi', 'lundi pour mardi', 'jeudi pour vendredi',
    'vendredi pour samedi', 'samedi pour dimanche',
    'jour de livraison', 'jours de livraison', 'jour commande', 'jours commande',
    'nombre de produits', 'produit', 'stock actuel', 'semaine dernière',
    'suggestion', 'à commander', 'a commander', 'note'
  ];
  if (patterns.some(p => low.includes(p))) return true;
  if (/^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/.test(low)) return true;
  if (/^\d+\s*(produit|produits)$/.test(low)) return true;
  return false;
}

function ManageView({
  suppliers,
  products,
  newSupplierName,
  setNewSupplierName,
  addSupplier,
  newProductName,
  setNewProductName,
  newProductSupplierId,
  setNewProductSupplierId,
  addProduct,
  toggleProductActive,
  bulkSetProductsActive,
  renameProduct,
  renameSupplier
}) {
  const [filter, setFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('all');
  const [showOnlySuspects, setShowOnlySuspects] = useState(false);
  const [showHidden, setShowHidden] = useState(true);
  const [selectedIds, setSelectedIds] = useState([]);

  const filteredProducts = products.filter(p => {
    const supplier = suppliers.find(s => s.id === p.supplier_id);
    const q = filter.trim().toLowerCase();
    if (!showHidden && p.active === false) return false;
    if (supplierFilter !== 'all' && p.supplier_id !== supplierFilter) return false;
    if (showOnlySuspects && !looksLikeFalseLine(p.name)) return false;
    if (!q) return true;
    return p.name.toLowerCase().includes(q) || supplier?.name?.toLowerCase().includes(q);
  });

  const selectedVisibleIds = selectedIds.filter(id => filteredProducts.some(p => p.id === id));

  function toggleSelected(id) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function selectAllVisible() {
    setSelectedIds(filteredProducts.map(p => p.id));
  }

  function clearSelection() {
    setSelectedIds([]);
  }

  function selectSuspects() {
    setSelectedIds(filteredProducts.filter(p => looksLikeFalseLine(p.name)).map(p => p.id));
  }

  async function bulkHide() {
    if (!selectedVisibleIds.length) return alert('Aucun produit sélectionné.');
    if (!confirm(`Masquer ${selectedVisibleIds.length} produit(s) sélectionné(s) ?`)) return;
    await bulkSetProductsActive(selectedVisibleIds, false);
    clearSelection();
  }

  async function bulkReactivate() {
    if (!selectedVisibleIds.length) return alert('Aucun produit sélectionné.');
    await bulkSetProductsActive(selectedVisibleIds, true);
    clearSelection();
  }

  return (
    <>
      <section className="card">
        <h2>Gestion rapide</h2>
        <p>Sélectionne plusieurs lignes, puis masque-les en une seule action. Idéal pour nettoyer les fausses lignes comme “mardi pour mercredi”.</p>
      </section>

      <section className="card manage-grid">
        <div>
          <h3>Ajouter un fournisseur</h3>
          <label>Nom du fournisseur
            <input value={newSupplierName} onChange={(e) => setNewSupplierName(e.target.value)} placeholder="Ex : Nouveau fournisseur" />
          </label>
          <button onClick={addSupplier}><Plus size={16}/>Ajouter fournisseur</button>
        </div>

        <div>
          <h3>Ajouter un produit</h3>
          <label>Fournisseur
            <select value={newProductSupplierId || ''} onChange={(e) => setNewProductSupplierId(e.target.value)}>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label>Nom du produit
            <input value={newProductName} onChange={(e) => setNewProductName(e.target.value)} placeholder="Ex : Tomates anciennes" />
          </label>
          <button onClick={addProduct}><Plus size={16}/>Ajouter produit</button>
        </div>
      </section>

      <section className="card bulk-toolbar">
        <div className="bulk-top">
          <div>
            <h2>Nettoyage produits</h2>
            <p>{filteredProducts.length} lignes affichées · {selectedVisibleIds.length} sélectionnées</p>
          </div>
          <div className="actions">
            <button className="secondary" onClick={selectAllVisible}>Tout sélectionner</button>
            <button className="secondary" onClick={selectSuspects}>Sélectionner suspects</button>
            <button className="secondary" onClick={clearSelection}>Désélectionner</button>
            <button className="danger" onClick={bulkHide}><EyeOff size={16}/>Masquer sélection</button>
            <button className="secondary" onClick={bulkReactivate}><Eye size={16}/>Réactiver sélection</button>
          </div>
        </div>

        <div className="manage-filters">
          <div className="search-wrap manage-search"><Search size={18}/><input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Rechercher produit ou fournisseur..." /></div>
          <select value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)}>
            <option value="all">Tous les fournisseurs</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <label className="checkline"><input type="checkbox" checked={showOnlySuspects} onChange={(e) => setShowOnlySuspects(e.target.checked)} /> Fausses lignes probables</label>
          <label className="checkline"><input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} /> Voir produits masqués</label>
        </div>
      </section>

      <section className="manage-list">
        {filteredProducts.map(p => {
          const supplier = suppliers.find(s => s.id === p.supplier_id);
          const selected = selectedIds.includes(p.id);
          const suspect = looksLikeFalseLine(p.name);
          return (
            <div key={p.id} className={'manage-row ' + (selected ? 'selected ' : '') + (p.active === false ? 'hidden-row ' : '') + (suspect ? 'suspect-row' : '')}>
              <button className="select-btn" onClick={() => toggleSelected(p.id)}>
                {selected ? <CheckSquare size={22}/> : <Square size={22}/>}
              </button>
              <div className="manage-main">
                <strong>{p.name}</strong>
                <span>{supplier?.name || 'Sans fournisseur'} {p.active === false ? '· masqué' : ''} {suspect ? '· suspect' : ''}</span>
              </div>
              <div className="row-actions">
                <button className="secondary" onClick={() => renameProduct(p.id, p.name)}><Edit3 size={16}/>Renommer</button>
                <button className="secondary" onClick={() => toggleProductActive(p.id, !p.active)}>
                  {p.active ? <><EyeOff size={16}/>Masquer</> : <><Eye size={16}/>Réactiver</>}
                </button>
              </div>
            </div>
          );
        })}
      </section>

      <section className="card">
        <h2>Renommer un fournisseur</h2>
        <div className="supplier-manage-grid">
          {suppliers.map(s => (
            <button key={s.id} className="secondary" onClick={() => renameSupplier(s.id, s.name)}><Edit3 size={16}/>{s.name}</button>
          ))}
        </div>
      </section>
    </>
  );
}


createRoot(document.getElementById('root')).render(<App />);

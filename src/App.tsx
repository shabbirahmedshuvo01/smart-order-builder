import { useEffect, useState } from 'react';
import appendixMenu from './fixtures/appendixMenu.json';
import { BuilderView } from './components/BuilderView';
import { CartPanel } from './components/CartPanel';
import { SalesAssistantPanel } from './components/SalesAssistantPanel';
import {
  getMenu,
  getStoreState,
  handleAddToCart,
  handleCheckout,
  handleEditCartItem,
  handleExportOrders,
  handleGetOrders,
  handleRemoveCartItem,
} from './mocks/mockStore';
import { getServerTimeIso } from './mocks/serverClock';
import type { CartLine, ItemConfig, MenuFixture, StoredOrder } from './types/order';

export function App() {
  const [menu, setMenu] = useState<MenuFixture>(appendixMenu as MenuFixture);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [remainingStock, setRemainingStock] = useState<Record<string, number>>(
    (appendixMenu as MenuFixture).initialStock
  );
  const [serverTimeIso, setServerTimeIso] = useState<string>(getServerTimeIso());
  const [storedOrders, setStoredOrders] = useState<StoredOrder[]>([]);
  const [editingLine, setEditingLine] = useState<CartLine | null>(null);
  const [activeTab, setActiveTab] = useState<'cart' | 'assistant'>('cart');

  // Sync state from mock store
  const refreshState = () => {
    const state = getStoreState();
    setCart(state.cart);
    setRemainingStock(state.remainingStock);
    setServerTimeIso(state.serverTime);

    const ordersData = handleGetOrders();
    setStoredOrders(ordersData.orders || []);
  };

  useEffect(() => {
    // Initial fetch
    const menuData = getMenu();
    setMenu(menuData.menu);
    refreshState();

    // Periodic sync
    const timer = setInterval(() => {
      refreshState();
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const onAddToCart = async (config: ItemConfig, idempotencyKey: string) => {
    const res = handleAddToCart(config, idempotencyKey);
    refreshState();
    return res;
  };

  const onSaveEdit = async (lineId: string, newConfig: ItemConfig) => {
    const res = handleEditCartItem(lineId, newConfig);
    if (res.ok) {
      setEditingLine(null);
    }
    refreshState();
    return res;
  };

  const onRemoveItem = (lineId: string) => {
    handleRemoveCartItem(lineId);
    if (editingLine?.id === lineId) {
      setEditingLine(null);
    }
    refreshState();
  };

  const onCheckout = async (
    paymentMethod: 'card' | 'bkash' | 'cash',
    couponCode: string | null,
    checkoutIdempotencyKey: string
  ) => {
    const res = handleCheckout(paymentMethod, couponCode, checkoutIdempotencyKey);
    refreshState();
    return res;
  };

  const onExportOrders = () => {
    const jsonStr = handleExportOrders();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'orders.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 flex flex-col">
      {/* Header Bar */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 shadow-sm flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-indigo-700 tracking-tight">
            Smart Order Builder
          </h1>
          <p className="text-xs text-slate-500">
            Custom Breakfast Studio & Live Sales Dashboard
          </p>
        </div>

        {/* Server Clock Badge */}
        <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 text-indigo-900 px-3 py-1.5 rounded-lg text-xs font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>
            Server Time: {new Date(serverTimeIso).toLocaleTimeString()} (+90s offset)
          </span>
        </div>
      </header>

      {/* Main Grid Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Builder View */}
        <div className="lg:col-span-7">
          <BuilderView
            menu={menu}
            remainingStock={remainingStock}
            editingLine={editingLine}
            onAddToCart={onAddToCart}
            onSaveEdit={onSaveEdit}
            onCancelEdit={() => setEditingLine(null)}
          />
        </div>

        {/* Right Column: Tabbed Cart & Assistant */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          {/* Tab Switcher */}
          <div className="flex bg-slate-200 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('cart')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                activeTab === 'cart'
                  ? 'bg-white text-indigo-700 shadow'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Cart & Checkout ({cart.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('assistant')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                activeTab === 'assistant'
                  ? 'bg-white text-indigo-700 shadow'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Sales Assistant
            </button>
          </div>

          {/* Active Tab Panel */}
          {activeTab === 'cart' ? (
            <CartPanel
              cart={cart}
              menu={menu}
              serverTimeIso={serverTimeIso}
              onRemoveItem={onRemoveItem}
              onEditItem={(line) => setEditingLine(line)}
              onCheckout={onCheckout}
              onExportOrders={onExportOrders}
              pastOrders={storedOrders}
            />
          ) : (
            <SalesAssistantPanel liveOrders={storedOrders} />
          )}
        </div>
      </main>
    </div>
  );
}

export default App;

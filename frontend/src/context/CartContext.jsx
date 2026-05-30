import { createContext, useContext, useState, useCallback, useEffect } from "react";

const CartContext = createContext();

export function CartProvider({ children }) {
  const [cart, setCart] = useState(() => {
    try {
      const saved = localStorage.getItem("easy_eats_cart");
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [pendingItem, setPendingItem] = useState(null);

  // Sync cart to localStorage on every change
  useEffect(() => {
    localStorage.setItem("easy_eats_cart", JSON.stringify(cart));
  }, [cart]);

  const addToCart = useCallback((item) => {
    setCart((prev) => {
      if (prev.length > 0 && prev[0].stall_id !== item.stall_id) {
        setTimeout(() => setPendingItem(item), 0);
        return prev;
      }
      const existing = prev.find((p) => p.id === item.id);
      if (existing) {
        return prev.map((p) => p.id === item.id ? { ...p, qty: p.qty + 1 } : p);
      }
      return [...prev, { ...item, qty: 1 }];
    });
  }, []);

  const confirmReplace = useCallback(() => {
    if (!pendingItem) return;
    setCart([{ ...pendingItem, qty: 1 }]);
    setPendingItem(null);
  }, [pendingItem]);

  const cancelReplace = useCallback(() => setPendingItem(null), []);

  const increaseQty = useCallback((itemId) => {
    setCart((prev) => prev.map((item) => item.id === itemId ? { ...item, qty: item.qty + 1 } : item));
  }, []);

  const decreaseQty = useCallback((itemId) => {
    setCart((prev) =>
      prev.map((item) => item.id === itemId ? { ...item, qty: item.qty - 1 } : item)
          .filter((item) => item.qty > 0)
    );
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  // addItem: directly adds an item with a custom payload (used for recommendations)
  const addItem = useCallback((item) => {
    setCart((prev) => {
      const existing = prev.find((p) => p.id === item.id);
      if (existing) {
        return prev.map((p) => p.id === item.id ? { ...p, qty: p.qty + (item.qty || 1) } : p);
      }
      return [...prev, { ...item, qty: item.qty || 1 }];
    });
  }, []);

  const reorderItems = useCallback((items, stallId, stallName) => {
    const mapped = items.map((item) => ({
      id:           item.menu_item_id,
      name:         item.name,
      price:        item.price,
      image_url:    item.image_url || null,
      stall_id:     stallId,
      stall_name:   stallName,
      category:     item.category || "All",
      is_available: true,
      qty:          item.qty || 1,
    }));
    setCart(mapped);
  }, []);

  const cartTotal = cart.reduce((sum, item) => sum + (item.discounted_price || item.price) * item.qty, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.qty, 0);
  const stallId   = cart.length > 0 ? cart[0].stall_id   : null;
  const stallName = cart.length > 0 ? cart[0].stall_name : null;

  return (
    <CartContext.Provider value={{
      cart, addToCart, addItem, increaseQty, decreaseQty, clearCart, reorderItems,
      cartTotal, cartCount, stallId, stallName,
      pendingItem, confirmReplace, cancelReplace,
    }}>

      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}

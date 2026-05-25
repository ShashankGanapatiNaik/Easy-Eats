// src/components/ai/WalletWidget.jsx
// Wallet balance card, top-up modal, and transaction history

import { useState, useEffect } from "react";
import api from "../../api";

// ── API helpers ───────────────────────────────────────────────────────────────
const getBalance     = ()      => api.get("/wallet/balance");
const topUp          = (amt)   => api.post("/wallet/topup",   { amount: amt });
const getTransactions= ()      => api.get("/wallet/transactions");

// ── Preset top-up amounts ─────────────────────────────────────────────────────
const TOPUP_PRESETS = [50, 100, 200, 500];

// ── Sub-components ────────────────────────────────────────────────────────────
function loadRazorpay() {
  return new Promise((resolve) => {
    if (window.Razorpay) { resolve(true); return; }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload  = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

function TxnRow({ txn }) {
  const isCredit = txn.amount > 0;
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${
          isCredit ? "bg-lime-100 text-lime-700" : "bg-red-50 text-red-500"
        }`}>
          {isCredit ? "+" : "−"}
        </div>
        <div>
          <p className="text-sm font-semibold text-zinc-900 leading-tight">{txn.description}</p>
          <p className="text-xs text-gray-400">
            {new Date(txn.created_at).toLocaleDateString("en-IN", {
              day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
            })}
          </p>
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <p className={`font-bold text-sm ${isCredit ? "text-lime-600" : "text-red-500"}`}>
          {isCredit ? "+" : "−"}₹{Math.abs(txn.amount).toFixed(0)}
        </p>
        <p className="text-xs text-gray-400">Bal: ₹{txn.balance_after.toFixed(0)}</p>
      </div>
    </div>
  );
}

// ── TopUp Modal ───────────────────────────────────────────────────────────────
function TopUpModal({ onClose, onSuccess }) {
  const [amount,  setAmount]  = useState(100);
  const [custom,  setCustom]  = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const finalAmount = custom ? parseFloat(custom) : amount;

  const handleTopUp = async () => {
    if (!finalAmount || finalAmount <= 0) return;
    setLoading(true);
    setError(null);
    try {
      // 1. Load Razorpay
      const loaded = await loadRazorpay();
      if (!loaded) {
        setError("Razorpay failed to load. Check your internet connection.");
        setLoading(false);
        return;
      }

      // 2. Create Order on Backend
      const { data: rzp } = await api.post("/payments/create-order", {
        amount: Math.round(finalAmount),
      });

      const userData = JSON.parse(localStorage.getItem("user_data") || "{}");

      // 3. Open Razorpay Modal
      await new Promise((resolve, reject) => {
        const options = {
          key:         rzp.key,
          amount:      rzp.amount,
          currency:    "INR",
          name:        "Easy Eats Wallet",
          description: "Wallet Top-up",
          order_id:    rzp.razorpay_order_id,
          prefill: {
            name:  userData.name  || "",
            email: userData.email || "",
          },
          theme: { color: "#84cc16" },
          modal: {
            ondismiss: () => reject(new Error("Payment cancelled")),
          },
          handler: async (response) => {
            try {
              // 4. Verify Payment on Backend
              await api.post("/payments/verify", {
                razorpay_order_id:   response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature:  response.razorpay_signature,
              });
              resolve(response);
            } catch (err) {
              reject(new Error("Payment verification failed"));
            }
          },
        };

        const rzpInstance = new window.Razorpay(options);
        rzpInstance.open();
      });

      // 5. Success -> Call top-up endpoint
      const res = await topUp(finalAmount);
      onSuccess(res.data.balance);
    } catch (e) {
      if (e.message === "Payment cancelled") {
        setError("Payment was cancelled.");
      } else {
        setError(e.response?.data?.detail || e.message || "Top-up failed");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center
                    bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white w-full md:max-w-sm rounded-t-3xl md:rounded-3xl p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-black text-zinc-900 text-lg">💰 Add Money</h3>
          <button onClick={onClose}
            className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center
                       text-gray-500 hover:bg-gray-200">✕</button>
        </div>

        {/* Preset amounts */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          {TOPUP_PRESETS.map((p) => (
            <button key={p}
              onClick={() => { setAmount(p); setCustom(""); }}
              className={`py-2.5 rounded-xl text-sm font-bold border transition-all ${
                amount === p && !custom
                  ? "bg-zinc-900 text-white border-zinc-900"
                  : "border-gray-200 text-gray-600 hover:border-lime-500"
              }`}
            >
              ₹{p}
            </button>
          ))}
        </div>

        {/* Custom amount */}
        <div className="mb-5">
          <label className="text-xs font-bold text-gray-400 uppercase mb-1.5 block">
            Custom Amount
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₹</span>
            <input
              type="number"
              value={custom}
              onChange={(e) => { setCustom(e.target.value); setAmount(0); }}
              placeholder="Enter amount"
              className="w-full border border-gray-200 rounded-xl pl-8 pr-4 py-3 text-sm
                         outline-none focus:border-lime-500 focus:ring-1 focus:ring-lime-500"
            />
          </div>
        </div>

        {error && (
          <p className="text-red-500 text-sm bg-red-50 px-3 py-2 rounded-xl mb-4">⚠️ {error}</p>
        )}

        <button
          onClick={handleTopUp}
          disabled={loading || !finalAmount}
          className="w-full bg-lime-500 hover:bg-lime-600 text-zinc-900 py-3.5 rounded-xl
                     font-bold shadow-md transition-all disabled:opacity-50
                     flex items-center justify-center gap-2"
        >
          {loading
            ? <><div className="w-4 h-4 border-2 border-zinc-900/30 border-t-zinc-900 rounded-full animate-spin" />Adding…</>
            : `Add ₹${finalAmount || 0} to Wallet`
          }
        </button>

        <p className="text-center text-xs text-gray-400 mt-3">
          Demo mode — no real payment charged
        </p>
      </div>
    </div>
  );
}

// ── WalletWidget ──────────────────────────────────────────────────────────────
export default function WalletWidget({ compact = false }) {
  const [balance,  setBalance]  = useState(null);
  const [txns,     setTxns]     = useState([]);
  const [showTopUp,setShowTopUp]= useState(false);
  const [showTxns, setShowTxns] = useState(false);
  const [loading,  setLoading]  = useState(true);
  const [showFullModal, setShowFullModal] = useState(false);

  useEffect(() => {
    loadWallet();
  }, []);

  const loadWallet = async () => {
    try {
      const [balRes, txnRes] = await Promise.all([getBalance(), getTransactions()]);
      setBalance(balRes.data.balance);
      setTxns(txnRes.data);
    } catch {
      setBalance(0);
    } finally {
      setLoading(false);
    }
  };

  const handleTopUpSuccess = (newBalance) => {
    setBalance(newBalance);
    setShowTopUp(false);
    loadWallet(); // refresh transactions
  };

  if (loading) return (
    <div className="bg-white rounded-2xl p-4 border border-gray-100 animate-pulse h-20" />
  );

  // ── Compact mode ─────────────────────────────
  if (compact) return (
    <>
      <button
        onClick={() => setShowFullModal(true)}
        className="flex items-center gap-2 bg-lime-50 border border-lime-200
                   px-3 py-1.5 rounded-xl hover:bg-lime-100 transition-all"
      >
        <span className="text-sm">💰</span>
        <span className="font-bold text-lime-700 text-sm">₹{balance?.toFixed(0) ?? "0"}</span>
        <span className="text-xs text-lime-500">+</span>
      </button>

      {showFullModal && (
        <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center
                        bg-black/50 backdrop-blur-sm"
          onClick={() => { setShowFullModal(false); loadWallet(); }}
        >
          <div
            className="w-full md:max-w-sm rounded-t-3xl md:rounded-3xl shadow-2xl bg-zinc-50 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
             <div className="px-5 py-4 bg-white flex justify-between items-center border-b border-gray-100">
                <h3 className="font-black text-zinc-900 text-lg">My Wallet</h3>
                <button onClick={() => { setShowFullModal(false); loadWallet(); }} className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-200">✕</button>
             </div>
             <div className="p-4 overflow-y-auto max-h-[80vh]">
               <WalletWidget compact={false} />
             </div>
          </div>
        </div>
      )}
    </>
  );

  // ── Full wallet card ──────────────────────────────────────────────────────
  return (
    <>
      <div className="bg-gradient-to-br from-zinc-900 to-zinc-800 rounded-3xl p-5 text-white
                      shadow-lg relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute -right-8 -top-8 w-32 h-32 bg-lime-500/10 rounded-full" />
        <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-lime-500/5 rounded-full" />

        <div className="relative z-10">
          <div className="flex items-center justify-between mb-1">
            <p className="text-zinc-400 text-sm font-medium">Easy Eats Wallet</p>
            <span className="text-xl">💰</span>
          </div>
          <p className="text-4xl font-black mb-4">₹{balance?.toFixed(0) ?? "0"}</p>

          <div className="flex gap-2">
            <button
              onClick={() => setShowTopUp(true)}
              className="flex-1 bg-lime-500 hover:bg-lime-400 text-zinc-900 py-2.5 rounded-xl
                         font-bold text-sm transition-all"
            >
              + Add Money
            </button>
            <button
              onClick={() => setShowTxns((v) => !v)}
              className="px-4 py-2.5 bg-white/10 hover:bg-white/20 rounded-xl
                         text-sm font-semibold transition-all"
            >
              History
            </button>
          </div>
        </div>
      </div>

      {/* Transaction history */}
      {showTxns && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-bold text-zinc-900 text-sm">Transaction History</h3>
            <span className="text-xs text-gray-400">{txns.length} records</span>
          </div>
          <div className="px-4 max-h-60 overflow-y-auto">
            {txns.length === 0 ? (
              <p className="text-center text-gray-400 py-6 text-sm">No transactions yet</p>
            ) : (
              txns.map((t) => <TxnRow key={t.id} txn={t} />)
            )}
          </div>
        </div>
      )}

      {showTopUp && (
        <TopUpModal
          onClose={() => setShowTopUp(false)}
          onSuccess={handleTopUpSuccess}
        />
      )}
    </>
  );
}
// src/pages/WalletPage.jsx
import { useNavigate } from "react-router-dom";
import WalletWidget from "../components/ai/WalletWidget";

export default function WalletPage() {
  const navigate = useNavigate();
  return (
    <div className="max-w-md mx-auto min-h-screen bg-zinc-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-4 sticky top-0 z-20">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center
                     hover:bg-gray-200 active:scale-95 transition-all"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
            strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
        </button>
        <h1 className="text-xl font-bold text-zinc-900">Easy Eats Wallet</h1>
      </div>

      <div className="px-4 py-5 space-y-4">
        <WalletWidget />

        {/* Info card */}
        <div className="bg-lime-50 border border-lime-200 rounded-2xl p-4">
          <p className="font-bold text-lime-800 text-sm mb-1">💡 How wallet works</p>
          <ul className="text-xs text-lime-700 space-y-1">
            <li>• Add money anytime using the + Add Money button</li>
            <li>• Use EatsBot (🤖) to order with your voice</li>
            <li>• AI auto-deducts wallet balance after confirmation</li>
            <li>• View all transactions in History</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
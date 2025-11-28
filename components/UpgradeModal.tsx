
import React from 'react';
import { X, Check, Zap, Crown, Shield } from 'lucide-react';

interface UpgradeModalProps {
  onClose: () => void;
  onSuccess: (amount: number) => void;
  userEmail: string;
  userName: string;
}

interface Plan {
  id: string;
  name: string;
  credits: number;
  price: number;
  features: string[];
  popular?: boolean;
  color: string;
  icon: React.ReactNode;
}

// Global definition for FlutterwaveCheckout
declare global {
  interface Window {
    FlutterwaveCheckout: any;
  }
}

export const UpgradeModal: React.FC<UpgradeModalProps> = ({ onClose, onSuccess, userEmail, userName }) => {
  const FLUTTERWAVE_PUBLIC_KEY = 'FLWPUBK-e56c2c23b29101ad4b0b1f8cbf637ccc-X';

  const plans: Plan[] = [
    {
      id: 'starter',
      name: 'Starter Pack',
      credits: 20,
      price: 5,
      features: ['20 Credits', 'No Expiration', 'Access all tools'],
      color: 'bg-blue-50 border-blue-200 text-blue-900',
      icon: <Zap className="text-blue-500" />
    },
    {
      id: 'creator',
      name: 'Creator Pro',
      credits: 100,
      price: 20,
      features: ['100 Credits', 'Priority Processing', 'HD Downloads', 'Best Value'],
      popular: true,
      color: 'bg-indigo-50 border-indigo-200 text-indigo-900',
      icon: <Crown className="text-indigo-500" />
    },
    {
      id: 'studio',
      name: 'Studio Elite',
      credits: 300,
      price: 50,
      features: ['300 Credits', 'Highest Priority', 'Commercial License', 'Dedicated Support'],
      color: 'bg-purple-50 border-purple-200 text-purple-900',
      icon: <Shield className="text-purple-500" />
    }
  ];

  const handlePayment = (plan: Plan) => {
    // Check global window object for the script
    if (!window.FlutterwaveCheckout) {
      alert("Payment gateway is initializing. Please wait a moment and try again.");
      return;
    }

    const config = {
      public_key: FLUTTERWAVE_PUBLIC_KEY,
      tx_ref: `tx-loopgenie-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      amount: plan.price,
      currency: "USD",
      payment_options: "card, mobilemoneyghana, ussd",
      customer: {
        email: userEmail,
        name: userName || 'LoopGenie Creator',
      },
      customizations: {
        title: `LoopGenie Premium`,
        description: `Upgrade to ${plan.name}`,
        logo: "https://cdn-icons-png.flaticon.com/512/3135/3135715.png", // Film frame icon to match branding
      },
      // Using callback ensures the payment stays inline (modal) and does not redirect
      callback: function (data: any) {
        console.log("Flutterwave Payment Response:", data);
        if (data.status === "successful") {
            onSuccess(plan.credits);
            onClose();
        } else {
            // Handle specific failure cases if needed
        }
      },
      onclose: function() {
        // When user cancels/closes the payment modal, we just log it.
        // We keep the Plan Selection modal open so they can try again or choose a different plan.
        console.log("Payment modal closed by user");
      }
    };

    window.FlutterwaveCheckout(config);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto relative flex flex-col">
        
        {/* Header - Sticky to keep close button visible */}
        <div className="p-6 md:p-8 text-center border-b border-gray-100 bg-gray-50/80 sticky top-0 z-20 backdrop-blur-xl relative">
            {/* Close Button Inside Header */}
            <button 
                onClick={onClose}
                className="absolute top-4 right-4 p-2 text-gray-500 hover:text-gray-900 bg-white rounded-full shadow-sm hover:shadow-md transition-all border border-gray-200"
                aria-label="Close Modal"
            >
                <X size={20} />
            </button>

            <div className="inline-flex items-center justify-center p-3 bg-indigo-100 rounded-2xl mb-4 text-indigo-600">
                <Zap size={32} />
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Upgrade Your Credits</h2>
            <p className="text-gray-500 max-w-lg mx-auto">
                Generate more videos, unlock higher resolutions, and create without limits. Credits never expire.
            </p>
        </div>

        {/* Plans */}
        <div className="p-6 md:p-10 bg-white">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {plans.map((plan) => (
                    <div 
                        key={plan.id}
                        className={`relative rounded-2xl border-2 p-6 flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${
                            plan.popular 
                            ? 'border-indigo-500 bg-white shadow-indigo-100 ring-4 ring-indigo-50' 
                            : 'border-gray-100 hover:border-gray-200 bg-white'
                        }`}
                    >
                        {plan.popular && (
                            <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-lg">
                                MOST POPULAR
                            </div>
                        )}

                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${plan.color}`}>
                            {plan.icon}
                        </div>

                        <h3 className="text-xl font-bold text-gray-900">{plan.name}</h3>
                        <div className="mt-2 mb-6">
                            <span className="text-4xl font-extrabold text-gray-900">${plan.price}</span>
                            <span className="text-gray-500 font-medium ml-1">USD</span>
                        </div>

                        <ul className="space-y-3 mb-8 flex-1">
                            {plan.features.map((feature, i) => (
                                <li key={i} className="flex items-center gap-2 text-sm text-gray-600 font-medium">
                                    <Check size={16} className="text-green-500 flex-shrink-0" />
                                    {feature}
                                </li>
                            ))}
                        </ul>

                        <button
                            onClick={() => handlePayment(plan)}
                            className={`w-full py-3.5 rounded-xl font-bold transition-all shadow-md active:scale-95 ${
                                plan.popular
                                ? 'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-indigo-500/30'
                                : 'bg-gray-900 text-white hover:bg-gray-800'
                            }`}
                        >
                            Select Plan
                        </button>
                    </div>
                ))}
            </div>
            
            <div className="mt-10 flex flex-col items-center gap-4">
                <div className="text-center text-xs text-gray-400">
                    <p className="flex items-center justify-center gap-2">
                        <Shield size={12} /> Secure payment via Flutterwave. Credits are added immediately.
                    </p>
                </div>
                
                <button 
                    onClick={onClose}
                    className="text-gray-500 hover:text-gray-900 font-medium text-sm px-6 py-2 rounded-lg hover:bg-gray-100 transition-colors"
                >
                    No thanks, I'll stick with free credits for now
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};

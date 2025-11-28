
import React, { useState } from 'react';
import { signIn, signUp, resetPassword } from '../services/authService';
import { Loader2, Mail, Lock, User, ArrowRight, Eye, EyeOff, ArrowLeft } from 'lucide-react';

interface AuthProps {
  initialView?: 'LOGIN' | 'SIGNUP';
  onBack?: () => void;
}

export const Auth: React.FC<AuthProps> = ({ initialView = 'LOGIN', onBack }) => {
  const [isLogin, setIsLogin] = useState(initialView === 'LOGIN');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (isForgotPassword) {
        await resetPassword(email);
        setMessage('Password reset link sent to your email. Check your inbox (and spam).');
        setLoading(false);
        return;
      }

      if (isLogin) {
        await signIn(email, password);
        // App.tsx will detect session change
      } else {
        await signUp(email, password, fullName);
        // Supabase usually requires email verification
        setMessage('Account created! Please check your email to verify your account before logging in.');
        setIsLogin(true); // Switch to login screen
      }
    } catch (err: any) {
      let msg = err.message || 'Authentication failed';
      // Enhance error message for common issue
      if (msg.includes('Invalid login credentials')) {
          msg += '. Please check your password or verify that you have confirmed your email address.';
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 relative">
      {onBack && (
        <button 
            onClick={onBack}
            className="absolute top-6 left-6 flex items-center gap-2 text-gray-500 hover:text-gray-900 font-medium transition-colors"
        >
            <ArrowLeft size={20} /> Back
        </button>
      )}

      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-xl mx-auto mb-4 shadow-lg transform rotate-3">
            L
          </div>
          <h2 className="text-3xl font-bold text-gray-900">
            {isForgotPassword ? 'Reset Password' : isLogin ? 'Welcome Back' : 'Create Account'}
          </h2>
          <p className="text-gray-500 mt-2">
            {isForgotPassword 
              ? 'Enter your email to receive reset instructions' 
              : isLogin 
                ? 'Sign in to LoopGenie' 
                : 'Start creating amazing avatar videos'}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">
             <span className="font-bold block mb-1">Error</span>
             {error}
          </div>
        )}

        {message && (
          <div className="mb-4 p-3 bg-green-50 text-green-700 text-sm rounded-lg border border-green-100 font-medium">
             {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && !isForgotPassword && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <User size={18} />
                </div>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-700 text-white placeholder-gray-500 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                  placeholder="John Doe"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                <Mail size={18} />
              </div>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-700 text-white placeholder-gray-500 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                placeholder="you@example.com"
              />
            </div>
          </div>

          {!isForgotPassword && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <Lock size={18} />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-3 bg-gray-800 border border-gray-700 text-white placeholder-gray-500 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                  placeholder="••••••••"
                />
                <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-200 cursor-pointer"
                >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between text-sm">
             {!isForgotPassword && (
                 <button 
                   type="button" 
                   onClick={() => setIsForgotPassword(true)}
                   className="text-indigo-600 hover:text-indigo-800 font-medium"
                 >
                   Forgot Password?
                 </button>
             )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="animate-spin" /> : isForgotPassword ? 'Send Reset Link' : isLogin ? 'Sign In' : 'Create Account'}
            {!loading && !isForgotPassword && <ArrowRight size={18} />}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-gray-100 text-center">
          {isForgotPassword ? (
             <button
               onClick={() => { setIsForgotPassword(false); setIsLogin(true); setError(null); setMessage(null); }}
               className="text-indigo-600 font-bold hover:underline"
             >
               Back to Sign In
             </button>
          ) : (
              <p className="text-gray-600">
                {isLogin ? "Don't have an account?" : "Already have an account?"}
                <button
                  onClick={() => setIsLogin(!isLogin)}
                  className="ml-2 text-indigo-600 font-bold hover:underline focus:outline-none"
                >
                  {isLogin ? 'Sign Up' : 'Sign In'}
                </button>
              </p>
          )}
        </div>
      </div>
    </div>
  );
};

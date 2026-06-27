import React, { useState } from "react";
import { auth, db } from "../firebase";
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  GoogleAuthProvider,
  signInWithPopup, 
  updateProfile 
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { LogIn, UserPlus, Key, Mail, User, ShieldCheck } from "lucide-react";
import { handleFirestoreError, OperationType } from "../utils/firestoreError";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const syncUserProfile = async (uid: string, name: string, emailStr: string | null) => {
    try {
      await setDoc(doc(db, "users", uid), {
        uid,
        displayName: name,
        email: emailStr || "Google Player",
        createdAt: new Date().toISOString()
      }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${uid}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isSignUp) {
        if (!displayName.trim()) {
          throw new Error("Please enter a display name.");
        }
        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCred.user, { displayName });
        await syncUserProfile(userCred.user.uid, displayName, email);
      } else {
        const userCred = await signInWithEmailAndPassword(auth, email, password);
        const name = userCred.user.displayName || userCred.user.email?.split("@")[0] || "Player";
        await syncUserProfile(userCred.user.uid, name, email);
      }
    } catch (err: any) {
      setError(err.message || "An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      const userCred = await signInWithPopup(auth, provider);
      const name = userCred.user.displayName || userCred.user.email?.split("@")[0] || "Google Player";
      await syncUserProfile(userCred.user.uid, name, userCred.user.email);
    } catch (err: any) {
      setError(err.message || "Failed to sign in with Google.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4 text-slate-100 font-sans" id="login-screen-container">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border-2 border-slate-800 bg-slate-900/50 shadow-2xl transition-all duration-300 hover:border-indigo-500/30" id="login-card">
        {/* Header / Brand */}
        <div className="relative bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-950 border-b border-slate-800 px-6 py-8 text-center" id="login-card-header">
          <div className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-slate-850 px-2.5 py-0.5 text-[10px] font-mono font-medium tracking-wider text-indigo-400 border border-slate-700">
            <ShieldCheck className="h-3 w-3" /> SECURE AUTH
          </div>
          <div className="flex justify-center mb-3">
            <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center font-bold text-white text-xl shadow-inner shadow-black/40">E</div>
          </div>
          <h1 className="text-3xl font-extrabold tracking-wider text-white" id="app-title-login">Euchre<span className="text-indigo-400 font-semibold">Pro</span></h1>
          <p className="mt-2 text-xs text-slate-400 font-light">
            Professional Multiplayer Euchre Room with Real-Time Play & Chat
          </p>
        </div>

        {/* Form area */}
        <div className="p-6 md:p-8" id="login-card-body">
          {error && (
            <div className="mb-4 rounded-lg bg-red-950/60 border border-red-800/60 p-3 text-xs text-red-400 font-medium animate-fade-in" id="login-error-alert">
              {error}
            </div>
          )}

          {/* Google Sign In option (First-Class Citizen) */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-750 text-slate-200 py-3 text-sm font-semibold transition-all hover:border-slate-600 hover:text-white active:scale-[0.98] disabled:opacity-50 shadow-md shadow-black/20"
            id="google-login-btn"
          >
            <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
              <g transform="matrix(1, 0, 0, 1, 0, 0)">
                <path d="M21.35,11.1H12v2.7h5.38c-0.24,1.28 -0.96,2.37 -2.04,3.1v2.58h3.3c1.93,-1.78 3.04,-4.4 3.04,-7.48C21.68,11.75 21.56,11.4 21.35,11.1z" fill="#4285F4" />
                <path d="M12,20.62c2.59,0 4.77,-0.86 6.36,-2.33l-3.3,-2.58c-0.91,0.61 -2.08,0.98 -3.06,0.98 -2.36,0 -4.36,-1.59 -5.08,-3.73H3.53v2.66C5.12,18.72 8.35,20.62 12,20.62z" fill="#34A853" />
                <path d="M6.92,12.97c-0.18,-0.54 -0.29,-1.11 -0.29,-1.7s0.11,-1.16 0.29,-1.7V6.91H3.53C2.92,8.12 2.58,9.49 2.58,10.97c0,1.48 0.34,2.85 0.95,4.06l3.39,-2.06Z" fill="#FBBC05" />
                <path d="M12,6.13c1.41,0 2.68,0.49 3.68,1.44l2.76,-2.76C16.76,3.22 14.58,2.32 12,2.32c-3.65,0 -6.88,1.9 -8.47,4.59l3.39,2.66c0.72,-2.14 2.72,-3.73 5.08,-3.73z" fill="#EA4335" />
              </g>
            </svg>
            <span>{loading ? "Connecting..." : "Continue with Google"}</span>
          </button>

          {/* Divider */}
          <div className="relative my-6 flex items-center justify-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-850"></div>
            </div>
            <span className="relative bg-[#0f172a] px-3 text-[10px] font-mono text-slate-500 uppercase tracking-widest">or email access</span>
          </div>

          {/* Account sign in / sign up form */}
          <form onSubmit={handleSubmit} className="space-y-4" id="auth-form">
            {isSignUp && (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-400 tracking-wider">DISPLAY NAME</label>
                <div className="relative">
                  <User className="absolute top-3 left-3 h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    required
                    placeholder="Your game moniker"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full rounded-lg border border-slate-850 bg-slate-950 py-2.5 pl-10 pr-4 text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    id="signup-name-input"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400 tracking-wider">EMAIL ADDRESS</label>
              <div className="relative">
                <Mail className="absolute top-3 left-3 h-4 w-4 text-slate-500" />
                <input
                  type="email"
                  required
                  placeholder="name@domain.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-850 bg-slate-950 py-2.5 pl-10 pr-4 text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  id="auth-email-input"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400 tracking-wider">PASSWORD</label>
              <div className="relative">
                <Key className="absolute top-3 left-3 h-4 w-4 text-slate-500" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-850 bg-slate-950 py-2.5 pl-10 pr-4 text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  id="auth-password-input"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white transition-all hover:bg-indigo-500 active:scale-[0.98] disabled:opacity-50 shadow-md shadow-indigo-600/10"
              id="auth-submit-btn"
            >
              {isSignUp ? <UserPlus className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
              {loading ? "Please wait..." : isSignUp ? "Create Account" : "Sign In"}
            </button>

            <div className="flex flex-col gap-2 items-center justify-center mt-6 text-xs text-slate-400">
              <button
                type="button"
                onClick={() => setIsSignUp(!isSignUp)}
                className="hover:text-indigo-400 underline transition-colors"
                id="toggle-signup-btn"
              >
                {isSignUp ? "Already have an account? Sign In" : "Don't have an account? Register Now"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

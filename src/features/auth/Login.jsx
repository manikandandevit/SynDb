import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import GoogleIcon from "../../assets/icons/google.svg";
import FacebookIcon from "../../assets/icons/facebook.svg";
import { loginWithEmailPassword } from "../../api/client";

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await loginWithEmailPassword(email, password);
      if (result.ok) {
        navigate("/dashboard", { replace: true });
      } else {
        setError(result.error || "Invalid email or password.");
      }
    } catch {
      setError("Network error. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.div
      initial={{ x: 300, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -300, opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen grid grid-cols-1 md:grid-cols-2"
    >
      <div className="hidden md:flex items-center justify-center bg-black text-white p-10" />

      <div className="flex items-center justify-center bg-gray-100 p-6">
        <div className="bg-white/60 backdrop-blur-lg border border-gray-200 shadow-xl rounded-3xl p-10 w-full max-w-md text-center">
          <h2 className="text-3xl font-bold text-gray-800 mb-2">Welcome Back</h2>
          <p className="text-gray-600 mb-6 text-sm">Login with email and password</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-left">
            <div>
              <label htmlFor="login-email" className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="you@example.com"
                required
              />
            </div>
            <div>
              <label htmlFor="login-password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="••••••••"
                required
              />
            </div>
            {error ? (
              <p className="text-sm text-red-600" role="alert">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition disabled:opacity-60"
            >
              {loading ? "Signing in…" : "Login"}
            </button>
          </form>

          <div className="flex flex-col gap-4 mt-6">
            <button
              type="button"
              className="flex items-center justify-center gap-3 bg-white border border-gray-300 py-3 rounded-xl hover:bg-gray-50 transition shadow-sm opacity-60 cursor-not-allowed"
              disabled
            >
              <img src={GoogleIcon} className="w-6 h-6" alt="" />
              Continue with Google
            </button>
            <button
              type="button"
              className="flex items-center justify-center gap-3 bg-[#1877F2] text-white py-3 rounded-xl hover:bg-[#1666d1] transition shadow-md opacity-60 cursor-not-allowed"
              disabled
            >
              <img src={FacebookIcon} className="w-6 h-6" alt="" />
              Continue with Facebook
            </button>
          </div>

          <p className="text-gray-500 text-sm mt-4">
            <Link to="/" className="text-blue-600 font-semibold hover:underline">
              Back to home
            </Link>
          </p>
        </div>
      </div>
    </motion.div>
  );
}

export default Login;

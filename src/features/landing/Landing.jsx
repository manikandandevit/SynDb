import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { loginWithEmailPassword } from "../../api/client";

const TICKER_PHRASES = [
  "Ask your database in natural language — Postgres, MySQL, MongoDB, Oracle.",
  "Connect once. Query with @mentions in chat.",
  "SELECT insights without writing SQL.",
];

const containerVariants = (reduce) => ({
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: reduce ? 0 : 0.11,
      delayChildren: reduce ? 0 : 0.08,
    },
  },
});

const itemVariants = (reduce) => ({
  hidden: { opacity: 0, y: reduce ? 0 : 22 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 120, damping: 20 },
  },
});

function QueryTicker({ reduce }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduce) return undefined;
    const t = setInterval(() => setI((n) => (n + 1) % TICKER_PHRASES.length), 4200);
    return () => clearInterval(t);
  }, [reduce]);

  return (
    <div className="relative h-14 md:h-12 flex items-center justify-center md:justify-start overflow-hidden rounded-xl border border-blue-100/80 bg-gradient-to-r from-blue-50/90 to-indigo-50/60 px-4 backdrop-blur-sm">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      <p className="pl-6 text-left text-xs sm:text-sm font-mono text-blue-900/80 leading-snug">
        <span className="text-emerald-600 font-semibold mr-2">●</span>
        <AnimatePresence mode="wait">
          <motion.span
            key={i}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: reduce ? 0 : 0.35 }}
            className="inline-block"
          >
            {TICKER_PHRASES[i]}
          </motion.span>
        </AnimatePresence>
      </p>
    </div>
  );
}

function FloatingOrbs({ reduce }) {
  if (reduce) {
    return (
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-24 top-1/4 h-64 w-64 rounded-full bg-blue-400/15 blur-3xl" />
        <div className="absolute -left-20 bottom-1/4 h-56 w-56 rounded-full bg-indigo-400/12 blur-3xl" />
      </div>
    );
  }
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <motion.div
        className="absolute -right-24 top-1/4 h-72 w-72 rounded-full bg-blue-400/25 blur-3xl"
        animate={{ scale: [1, 1.12, 1], x: [0, 18, 0], y: [0, -12, 0] }}
        transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -left-28 bottom-1/3 h-64 w-64 rounded-full bg-cyan-400/20 blur-3xl"
        animate={{ scale: [1, 1.08, 1], x: [0, -22, 0] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut", delay: 1 }}
      />
      <motion.div
        className="absolute right-1/4 top-12 h-40 w-40 rounded-full bg-indigo-500/15 blur-2xl"
        animate={{ opacity: [0.4, 0.75, 0.4] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

function Landing() {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
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
    <div className="relative min-h-screen overflow-auto bg-slate-50 text-slate-900">
      <div className="landing-grid-layer pointer-events-none absolute inset-0 opacity-60" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          background:
            "linear-gradient(105deg, transparent 40%, rgba(59, 130, 246, 0.04) 50%, transparent 60%)",
          backgroundSize: "200% 100%",
          animation: reduce ? "none" : "landing-shimmer 12s ease-in-out infinite",
        }}
      />
      {!reduce && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 left-0 right-0 h-48 bg-gradient-to-b from-blue-400/10 via-cyan-400/5 to-transparent blur-md"
          initial={{ top: "-25%" }}
          animate={{ top: ["-25%", "110%"] }}
          transition={{ duration: 11, repeat: Infinity, ease: "linear" }}
        />
      )}
      <FloatingOrbs reduce={reduce} />

      <nav className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex justify-between items-center">
        <motion.img
          src="/image.png"
          alt="Logo"
          className="h-9 md:h-10 w-auto object-contain"
          initial={reduce ? false : { opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ type: "spring", stiffness: 140, damping: 22 }}
        />
        <motion.span
          className="hidden sm:inline text-xs font-mono text-blue-600/70 tracking-wide uppercase"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: reduce ? 0 : 0.5 }}
        >
          syn-db · query
        </motion.span>
      </nav>

      <section className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-16 grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-20 items-center">
        <motion.div
          className="text-center md:text-left"
          variants={containerVariants(reduce)}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={itemVariants(reduce)} className="mb-5">
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-200/80 bg-white/70 px-3 py-1 text-xs font-medium text-blue-700 shadow-sm backdrop-blur-sm">
              <motion.span
                className="h-1.5 w-1.5 rounded-full bg-blue-500"
                animate={reduce ? {} : { scale: [1, 1.3, 1], opacity: [1, 0.7, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              Natural language → your data
            </span>
          </motion.div>

          <motion.h1
            variants={itemVariants(reduce)}
            className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-[1.1] mb-5"
          >
            Welcome to
            <motion.span
              className="block bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-600 bg-clip-text text-transparent"
              animate={
                reduce
                  ? {}
                  : {
                      backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
                    }
              }
              transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
              style={{
                backgroundSize: "200% auto",
              }}
            >
              Modern Web Apps
            </motion.span>
          </motion.h1>

          <motion.p
            variants={itemVariants(reduce)}
            className="text-slate-600 text-base md:text-lg mb-6 max-w-xl mx-auto md:mx-0 leading-relaxed"
          >
            A production-ready workspace to connect databases and chat with your data — secure, fast, and built
            for real queries.
          </motion.p>

          <motion.div variants={itemVariants(reduce)} className="max-w-xl mx-auto md:mx-0 mb-8">
            <QueryTicker reduce={reduce} />
          </motion.div>

          <motion.div
            variants={itemVariants(reduce)}
            className="flex flex-wrap gap-2 justify-center md:justify-start text-[11px] sm:text-xs font-mono text-slate-500"
          >
            {["PostgreSQL", "MySQL", "MongoDB", "Oracle", "RAW"].map((tag, idx) => (
              <motion.span
                key={tag}
                initial={reduce ? false : { opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: reduce ? 0 : 0.55 + idx * 0.06 }}
                whileHover={reduce ? {} : { y: -2, color: "#2563eb" }}
                className="rounded-md border border-slate-200/90 bg-white/60 px-2 py-1 backdrop-blur-sm"
              >
                {tag}
              </motion.span>
            ))}
          </motion.div>
        </motion.div>

        <motion.div
          className="flex justify-center md:justify-end [perspective:1200px]"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduce ? 0 : 0.4 }}
        >
          <motion.div
            className="w-full max-w-md"
            initial={reduce ? false : { opacity: 0, y: 40, rotateX: -10, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }}
            transition={{
              type: "spring",
              stiffness: 90,
              damping: 18,
              delay: reduce ? 0 : 0.15,
            }}
          >
            <motion.div
              className="relative rounded-3xl p-[1px] bg-gradient-to-br from-blue-400/50 via-indigo-400/30 to-cyan-400/40 shadow-2xl shadow-blue-900/10"
              whileHover={reduce ? {} : { scale: 1.01 }}
              transition={{ type: "spring", stiffness: 260, damping: 22 }}
            >
              <div className="rounded-[calc(1.5rem-1px)] bg-white/90 backdrop-blur-xl p-8 md:p-10 border border-white/60">
                <motion.div
                  className="absolute -top-px left-8 right-8 h-px bg-gradient-to-r from-transparent via-blue-400/60 to-transparent"
                  animate={reduce ? {} : { opacity: [0.4, 1, 0.4], scaleX: [0.85, 1, 0.85] }}
                  transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
                />
                <h2 className="text-2xl font-bold text-slate-800 text-center mb-1">Login</h2>
                <p className="text-slate-500 text-sm text-center mb-6">Sign in to open your query workspace</p>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  {["email", "password"].map((field, idx) => (
                    <motion.div
                      key={field}
                      initial={reduce ? false : { opacity: 0, x: 16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: reduce ? 0 : 0.35 + idx * 0.08, type: "spring", stiffness: 140 }}
                    >
                      <label
                        htmlFor={field === "email" ? "landing-email" : "landing-password"}
                        className="block text-sm font-medium text-slate-700 mb-1"
                      >
                        {field === "email" ? "Email" : "Password"}
                      </label>
                      {field === "email" ? (
                        <input
                          id="landing-email"
                          type="email"
                          autoComplete="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white/80 text-slate-900 placeholder:text-slate-400 outline-none transition-shadow duration-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15"
                          placeholder="you@example.com"
                          required
                        />
                      ) : (
                        <input
                          id="landing-password"
                          type="password"
                          autoComplete="current-password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white/80 text-slate-900 placeholder:text-slate-400 outline-none transition-shadow duration-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15"
                          placeholder="••••••••"
                          required
                        />
                      )}
                    </motion.div>
                  ))}

                  <AnimatePresence>
                    {error ? (
                      <motion.p
                        role="alert"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="text-sm text-red-600 overflow-hidden"
                      >
                        {error}
                      </motion.p>
                    ) : null}
                  </AnimatePresence>

                  <motion.button
                    type="submit"
                    disabled={loading}
                    className="relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 py-3.5 font-semibold text-white shadow-lg shadow-blue-600/25 disabled:opacity-60 disabled:shadow-none"
                    whileHover={reduce || loading ? {} : { scale: 1.02, boxShadow: "0 12px 40px -10px rgba(37, 99, 235, 0.45)" }}
                    whileTap={reduce || loading ? {} : { scale: 0.98 }}
                    animate={loading && !reduce ? { opacity: [1, 0.88, 1] } : {}}
                    transition={loading && !reduce ? { duration: 1.2, repeat: Infinity } : {}}
                  >
                    {!reduce && !loading && (
                      <motion.span
                        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent"
                        initial={{ x: "-100%" }}
                        animate={{ x: "200%" }}
                        transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 1.5, ease: "easeInOut" }}
                      />
                    )}
                    <span className="relative z-10">{loading ? "Connecting…" : "Login"}</span>
                  </motion.button>
                </form>
              </div>
            </motion.div>
          </motion.div>
        </motion.div>
      </section>
    </div>
  );
}

export default Landing;

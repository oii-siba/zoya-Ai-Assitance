import React, { useState, useEffect } from 'react';
import { Star, ExternalLink, CheckCircle2, AlertCircle, Loader2, Heart, Sparkles } from 'lucide-react';

interface StarGateProps {
  repoOwner?: string;
  repoName?: string;
  children: React.ReactNode;
}

const DEFAULT_OWNER = 'oii-siba';
const DEFAULT_REPO = 'zoya-Ai-Assitance';

export const StarGate: React.FC<StarGateProps> = ({
  repoOwner = DEFAULT_OWNER,
  repoName = DEFAULT_REPO,
  children
}) => {
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
  const [githubUsername, setGithubUsername] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);

  const repoUrl = `https://github.com/${repoOwner}/${repoName}`;

  useEffect(() => {
    // Check if previously verified in localStorage
    const saved = localStorage.getItem('zoya_starred_verified');
    if (saved === 'true') {
      setIsUnlocked(true);
    }
  }, []);

  const handleOpenRepo = () => {
    window.open(repoUrl, '_blank', 'noopener,noreferrer');
  };

  const handleUnlock = (usernameToSave?: string) => {
    localStorage.setItem('zoya_starred_verified', 'true');
    if (usernameToSave) {
      localStorage.setItem('zoya_starred_user', usernameToSave);
    }
    setSuccess(true);
    setTimeout(() => {
      setIsUnlocked(true);
    }, 1200);
  };

  const verifyStar = async () => {
    const username = githubUsername.trim();
    if (!username) {
      setError('দয়া করে আপনার GitHub Username লিখুন!');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let isStarred = false;

      // 1. Check repo stargazers list (direct check from repository)
      const stargazersRes = await fetch(
        `https://api.github.com/repos/${repoOwner}/${repoName}/stargazers?per_page=100&t=${Date.now()}`,
        { headers: { Accept: 'application/vnd.github.v3+json' } }
      );

      if (stargazersRes.ok) {
        const gazers = await stargazersRes.json();
        if (Array.isArray(gazers)) {
          isStarred = gazers.some(
            (user: any) => user?.login?.toLowerCase() === username.toLowerCase()
          );
        }
      }

      // 2. If not found yet, also check the user's starred repositories list
      if (!isStarred) {
        const userStarredRes = await fetch(
          `https://api.github.com/users/${encodeURIComponent(username)}/starred?per_page=100&t=${Date.now()}`,
          { headers: { Accept: 'application/vnd.github.v3+json' } }
        );

        if (userStarredRes.ok) {
          const starred = await userStarredRes.json();
          if (Array.isArray(starred)) {
            isStarred = starred.some((item: any) => {
              const matchRepo = item?.name?.toLowerCase() === repoName.toLowerCase();
              const matchOwner = item?.owner?.login?.toLowerCase() === repoOwner.toLowerCase();
              const matchFull = item?.full_name?.toLowerCase() === `${repoOwner.toLowerCase()}/${repoName.toLowerCase()}`;
              return (matchRepo && matchOwner) || matchFull;
            });
          }
        } else if (userStarredRes.status === 404) {
          setError(`"${username}" নামের কোনো GitHub অ্যাকাউন্ট পাওয়া যায়নি। ইউজারনেম সঠিক কিনা চেক করুন।`);
          return;
        }
      }

      if (isStarred) {
        handleUnlock(username);
        return;
      }

      // If strictly not starred
      setError(
        `"${username}" অ্যাকাউন্ট থেকে এখনো Star পাওয়া যায়নি! অনুগ্রহ করে উপরে "GitHub-এ Star দিন" বাটনে ক্লিক করে Star ⭐ দিন এবং ৫-১০ সেকেন্ড পর আবার Verify করুন।`
      );
    } catch (err: any) {
      setError('ইন্টারনেট বা GitHub সংযোগে সমস্যা হচ্ছে। কিছুক্ষণ পর আবার চেষ্টা করুন।');
    } finally {
      setLoading(false);
    }
  };

  if (isUnlocked) {
    return <>{children}</>;
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-xl p-4 select-none animate-fadeIn">
      {/* Background Glows */}
      <div className="absolute top-1/4 left-1/3 w-80 h-80 bg-amber-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/3 w-80 h-80 bg-purple-500/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative w-full max-w-md bg-gradient-to-b from-[#161822] to-[#0e1017] border border-amber-500/30 rounded-3xl p-6 sm:p-8 shadow-[0_0_50px_rgba(245,158,11,0.15)] text-center text-white">
        {/* Top Floating Badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-semibold mb-4 tracking-wider uppercase">
          <Sparkles className="w-3.5 h-3.5" /> Open Source Verification
        </div>

        {/* Icon */}
        <div className="relative w-20 h-20 mx-auto mb-4 flex items-center justify-center">
          <div className="absolute inset-0 bg-amber-500/20 rounded-full blur-xl animate-pulse" />
          <div className="relative w-20 h-20 bg-gradient-to-tr from-amber-500 to-yellow-300 rounded-2xl flex items-center justify-center shadow-lg transform -rotate-3 hover:rotate-0 transition-transform">
            {success ? (
              <CheckCircle2 className="w-10 h-10 text-neutral-950 animate-bounce" />
            ) : (
              <Star className="w-10 h-10 text-neutral-950 fill-current" />
            )}
          </div>
        </div>

        {/* Heading */}
        <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white mb-2">
          {success ? 'ধন্যবাদ! Zoya আনলক হচ্ছে...' : 'Star to Unlock Zoya ⭐'}
        </h2>

        <p className="text-neutral-400 text-xs sm:text-sm leading-relaxed mb-6">
          <span className="text-amber-300 font-semibold">Zoya AI Assistance</span> সম্পূর্ণ ফ্রি ও ওপেন সোর্স! 
          আমাদের প্রজেক্টটি সাপোর্ট করতে এবং অ্যাক্সেস পেতে দয়া করে আমাদের GitHub রিপোজিটরিতে একটি <b className="text-white">Star</b> দিন।
        </p>

        {success ? (
          <div className="py-6 flex flex-col items-center justify-center gap-3">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <p className="text-emerald-400 font-semibold text-sm">Star সফলভাবে যাচাই হয়েছে! স্বাগতম!</p>
          </div>
        ) : (
          <>
            {/* Step 1: Star Button */}
            <div className="space-y-3 mb-6">
              <button
                onClick={handleOpenRepo}
                className="w-full group py-3.5 px-5 bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-neutral-950 font-bold rounded-2xl flex items-center justify-center gap-2.5 shadow-[0_0_25px_rgba(245,158,11,0.35)] active:scale-[0.98] transition-all cursor-pointer"
              >
                <Star className="w-5 h-5 fill-current text-neutral-950 group-hover:scale-110 transition-transform" />
                <span>GitHub-এ Star দিন</span>
                <ExternalLink className="w-4 h-4 opacity-75" />
              </button>
              <p className="text-[11px] text-neutral-500">
                উপরের বাটনে ক্লিক করে রিপোজিটরি ওপেন করে উপরে ডানপাশে <b className="text-neutral-300">Star ⭐</b> বাটনে চাপুন।
              </p>
            </div>

            {/* Step 2: Verification Input */}
            <div className="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-4 text-left">
              <label className="block text-xs font-semibold text-neutral-300 mb-2">
                আপনার GitHub Username দিয়ে যাচাই করুন:
              </label>
              
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  placeholder="e.g. oii-siba"
                  value={githubUsername}
                  onChange={(e) => {
                    setGithubUsername(e.target.value);
                    setError(null);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && verifyStar()}
                  className="flex-1 px-3.5 py-2.5 rounded-xl bg-neutral-950/80 border border-neutral-700 text-white placeholder-neutral-500 text-sm focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition"
                />
                <button
                  onClick={verifyStar}
                  disabled={loading}
                  className="px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 active:scale-95 disabled:opacity-50 text-white font-medium rounded-xl text-sm transition flex items-center gap-2 cursor-pointer border border-neutral-700"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin text-amber-400" /> : 'Verify'}
                </button>
              </div>

              {error && (
                <div className="flex items-start gap-2 p-2.5 rounded-xl bg-red-950/40 border border-red-800/60 text-red-300 text-xs mt-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                  <span>{error}</span>
                </div>
              )}
            </div>

            <div className="mt-5 flex items-center justify-center gap-1 text-[11px] text-neutral-500">
              Made with <Heart className="w-3 h-3 text-red-500 fill-red-500 inline mx-0.5" /> by Siba Boss
            </div>
          </>
        )}
      </div>
    </div>
  );
};

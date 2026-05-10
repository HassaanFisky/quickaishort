import React from 'react';
import { Shield, Lightbulb, TrendingUp, Lock, Users, Zap } from 'lucide-react';
import { StartupIdea } from '../data/ideas';

interface IdeaCardProps {
  idea: StartupIdea;
}

const IdeaCard: React.FC<IdeaCardProps> = ({ idea }) => {
  const getCategoryIcon = (category: string) => {
    switch (category.toLowerCase()) {
      case 'ai/ml': return <Zap className="w-4 h-4 text-emerald-400" />;
      case 'cybersecurity': return <Shield className="w-4 h-4 text-blue-400" />;
      case 'finance':
      case 'fintech': return <TrendingUp className="w-4 h-4 text-amber-400" />;
      case 'education': return <Users className="w-4 h-4 text-violet-400" />;
      default: return <Lightbulb className="w-4 h-4 text-zinc-400" />;
    }
  };

  return (
    <div className="group relative glass-effect rounded-2xl p-6 card-hover flex flex-col h-full border border-white/5">
      {/* Category Badge */}
      <div className="flex items-center gap-2 mb-4">
        <div className="p-1.5 rounded-lg bg-white/5 border border-white/10">
          {getCategoryIcon(idea.category)}
        </div>
        <span className="text-xs font-semibold tracking-wider text-zinc-400 uppercase">
          {idea.category}
        </span>
      </div>

      {/* Content */}
      <h3 className="text-lg font-bold text-white mb-3 leading-tight group-hover:text-emerald-400 transition-colors">
        {idea.title}
      </h3>
      <p className="text-sm text-zinc-400 mb-6 line-clamp-3 flex-grow leading-relaxed">
        {idea.description}
      </p>

      {/* Limited Preview Overlay */}
      {idea.isLimited && (
        <div className="mt-auto pt-6 border-t border-white/5">
          <div className="flex items-center gap-2 text-xs text-zinc-500 mb-4 bg-zinc-900/50 p-2 rounded-lg border border-white/5">
            <Lock className="w-3 h-3" />
            <span>Limited preview - express interest to view full details</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Funding Goal</p>
              <p className="text-sm font-bold text-zinc-200">{idea.fundingGoal}</p>
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Stage</p>
              <p className="text-sm font-bold text-zinc-200">{idea.stage}</p>
            </div>
          </div>

          <button className="w-full mt-6 py-2.5 px-4 rounded-xl bg-white/5 hover:bg-emerald-500 hover:text-black text-white text-sm font-semibold transition-all duration-300 border border-white/10 hover:border-emerald-500">
            Sign Up to View
          </button>
        </div>
      )}
    </div>
  );
};

export default IdeaCard;


import React, { useState, useMemo } from 'react';
import { Voter, Party, DEFAULT_PARTIES } from '../types';

interface DashboardProps {
  voters: Voter[];
  onUpdateVoter: (updatedVoter: Voter) => void;
  onAddVoter: (newVoter: Voter) => void;
  parties: Party[];
  onUpdateParties: (parties: Party[]) => void;
  onLogout: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ voters, onUpdateVoter, onAddVoter, parties, onUpdateParties, onLogout }) => {
  const [activeTab, setActiveTab] = useState<'ANALYTICS' | 'LIST'>('ANALYTICS');
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'VOTED' | 'NOT_VOTED'>('ALL');
  const [page, setPage] = useState<number>(1);
  const [showPartyConfig, setShowPartyConfig] = useState(false);
  const [analysisParty, setAnalysisParty] = useState<string | 'OVERALL'>('OVERALL');
  
  const ITEMS_PER_PAGE = 20;

  // --- Metrics Calculation ---
  const stats = useMemo(() => {
    const total = voters.length;
    const voted = voters.filter(v => v.isVoted).length;
    const remaining = total - voted;
    const percentage = total > 0 ? ((voted / total) * 100).toFixed(1) : '0.0';

    const partyCounts = voters.reduce((acc, v) => {
      if (v.isVoted && v.votedParty) {
        acc[v.votedParty] = (acc[v.votedParty] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);
    
    // Detailed Demographics
    const demographics = voters.reduce((acc, v) => {
       const g = v.gender.toUpperCase().startsWith('M') ? 'Male' : v.gender.toUpperCase().startsWith('F') ? 'Female' : 'Other';
       
       let a = 'Unknown';
       const ageVal = parseInt(v.age);
       if (!isNaN(ageVal)) {
           if (ageVal < 30) a = '18-29';
           else if (ageVal < 45) a = '30-45';
           else if (ageVal < 60) a = '46-60';
           else a = '60+';
       }

       // Initialize if missing
       if (!acc.gender[g]) acc.gender[g] = { total: 0, voted: 0, byParty: {} };
       if (!acc.age[a]) acc.age[a] = { total: 0, voted: 0, byParty: {} };

       // Increment Totals
       acc.gender[g].total++;
       acc.age[a].total++;

       // Increment Voted Stats
       if (v.isVoted) {
           acc.gender[g].voted++;
           acc.age[a].voted++;
           if (v.votedParty) {
               acc.gender[g].byParty[v.votedParty] = (acc.gender[g].byParty[v.votedParty] || 0) + 1;
               acc.age[a].byParty[v.votedParty] = (acc.age[a].byParty[v.votedParty] || 0) + 1;
           }
       }

       return acc;
    }, { 
        gender: {} as Record<string, { total: number, voted: number, byParty: Record<string, number> }>,
        age: {} as Record<string, { total: number, voted: number, byParty: Record<string, number> }>
    });

    // Ensure standard keys exist for rendering safety
    ['Male', 'Female'].forEach(k => { if (!demographics.gender[k]) demographics.gender[k] = { total: 0, voted: 0, byParty: {} } });
    ['18-29', '30-45', '46-60', '60+'].forEach(k => { if (!demographics.age[k]) demographics.age[k] = { total: 0, voted: 0, byParty: {} } });

    return { total, voted, remaining, percentage, partyCounts, demographics };
  }, [voters]);

  // --- Turnout Trend Calculation (Real-time / Minute precision) ---
  const turnoutTrend = useMemo(() => {
    // Get all voted voters sorted by timestamp
    const votedVoters = voters
      .filter(v => v.isVoted && v.timestamp)
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    if (votedVoters.length === 0) return [];

    // Determine Time Range
    const firstVoteTime = votedVoters[0].timestamp!;
    const lastVoteTime = votedVoters[votedVoters.length - 1].timestamp!;

    // Start from the top of the hour of the first vote
    const startDate = new Date(firstVoteTime);
    startDate.setMinutes(0, 0, 0);

    // End at the next hour after the last vote
    const endDate = new Date(lastVoteTime);
    if (endDate.getMinutes() > 0 || endDate.getSeconds() > 0) {
       endDate.setHours(endDate.getHours() + 1);
    }
    endDate.setMinutes(0, 0, 0);

    const trendPoints = [];
    let currentIter = new Date(startDate);
    let cumulative = 0;
    let voteIdx = 0;

    // Generate buckets every 1 minute for real-time granularity
    while (currentIter <= endDate) {
        const timeVal = currentIter.getTime();

        // Accumulate votes that happened up to this point
        while(voteIdx < votedVoters.length && (votedVoters[voteIdx].timestamp || 0) <= timeVal) {
            cumulative++;
            voteIdx++;
        }

        const pct = stats.total > 0 ? (cumulative / stats.total) * 100 : 0;
        
        // Format Label
        let hours = currentIter.getHours();
        const minutes = currentIter.getMinutes();
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12; 
        const minStr = minutes < 10 ? `0${minutes}` : minutes;

        // Determine if this point represents a major grid line
        const isHour = minutes === 0;
        const isHalfHour = minutes === 30;

        trendPoints.push({
            label: `${hours}:${minStr} ${ampm}`,
            percentage: pct,
            isHour: isHour,
            isHalfHour: isHalfHour,
            timestamp: timeVal
        });

        // Advance 1 minute
        currentIter.setMinutes(currentIter.getMinutes() + 1);
    }

    return trendPoints;
  }, [voters, stats.total]);

  // --- Filtering & Pagination ---
  const filteredVoters = useMemo(() => {
    return voters.filter(v => {
      const matchesSearch = 
        v.name_en.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.epic_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.sl_no.includes(searchTerm) || 
        v.house_no.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesFilter = 
        filter === 'ALL' || 
        (filter === 'VOTED' && v.isVoted) || 
        (filter === 'NOT_VOTED' && !v.isVoted);

      return matchesSearch && matchesFilter;
    }).sort((a, b) => {
        return parseInt(a.sl_no || '0') - parseInt(b.sl_no || '0');
    });
  }, [voters, searchTerm, filter]);

  const paginatedVoters = filteredVoters.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
  const totalPages = Math.ceil(filteredVoters.length / ITEMS_PER_PAGE);

  // --- Handlers ---
  const handleVoteToggle = (voter: Voter) => {
    onUpdateVoter({
      ...voter,
      isVoted: !voter.isVoted,
      votedParty: !voter.isVoted ? voter.votedParty : null,
      timestamp: Date.now()
    });
  };

  const handlePartySelect = (voter: Voter, party: string) => {
    onUpdateVoter({
      ...voter,
      isVoted: true,
      votedParty: party,
      timestamp: Date.now()
    });
  };

  const updatePartyState = (index: number, field: keyof Party, value: string) => {
      const newP = [...parties];
      newP[index] = { ...newP[index], [field]: value };
      onUpdateParties(newP);
  };
  
  const addParty = () => {
      onUpdateParties([...parties, { name: 'New Party', color: '#000000' }]);
  };

  const removeParty = (index: number) => {
      const newP = [...parties];
      newP.splice(index, 1);
      onUpdateParties(newP);
  };

  // Helper for rendering analytics bars
  const renderDemographicBar = (label: string, total: number, target: number, colorClass: string) => {
      const pct = total > 0 ? (target / total) * 100 : 0;
      return (
        <div className="mb-4">
            <div className="flex justify-between text-xs font-semibold text-gray-600 mb-1">
                <span>{label}</span>
                <span>{target} / {total} ({pct.toFixed(1)}%)</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden relative">
                <div 
                    className={`h-full rounded-full transition-all duration-700 ${colorClass}`}
                    style={{ width: `${pct}%` }}
                ></div>
            </div>
        </div>
      );
  };

  return (
    <div className="space-y-6">
      {/* Top Bar with Logout */}
      <div className="flex flex-col sm:flex-row justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100 gap-4">
         <div>
             <h2 className="text-xl font-bold text-gray-800">Election Analytics</h2>
             <p className="text-sm text-gray-500">Real-time Turnout & Trends</p>
         </div>
         <div className="flex gap-3">
             <button 
                onClick={() => setShowPartyConfig(true)}
                className="px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 text-sm font-medium transition-colors border border-indigo-100 flex items-center gap-2"
             >
                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                 Configure Parties
             </button>
             <button 
                onClick={onLogout}
                className="px-4 py-2 bg-white text-red-600 rounded-lg hover:bg-red-50 text-sm font-medium transition-colors border border-red-200"
             >
                 Logout
             </button>
         </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex justify-center">
          <div className="bg-gray-100 p-1 rounded-lg flex gap-1 shadow-inner">
              <button 
                onClick={() => setActiveTab('ANALYTICS')} 
                className={`px-6 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'ANALYTICS' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                  Analytics & Trends
              </button>
              <button 
                onClick={() => setActiveTab('LIST')} 
                className={`px-6 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'LIST' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                  Voter List
              </button>
          </div>
      </div>

      {/* Content Area Based on Active Tab */}
      
      {/* 1. ANALYTICS TAB */}
      {activeTab === 'ANALYTICS' && (
          <div className="space-y-6 animate-fade-in">
                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between">
                    <p className="text-sm font-medium text-gray-500">Total Voters</p>
                    <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
                    </div>
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between">
                    <p className="text-sm font-medium text-gray-500">Votes Polled</p>
                    <p className="text-3xl font-bold text-emerald-600">{stats.voted}</p>
                    </div>
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between">
                    <p className="text-sm font-medium text-gray-500">Remaining</p>
                    <p className="text-3xl font-bold text-orange-500">{stats.remaining}</p>
                    </div>
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between">
                    <p className="text-sm font-medium text-gray-500">Polling Percentage</p>
                    <div className="flex items-end gap-2">
                        <p className="text-3xl font-bold text-indigo-600">{stats.percentage}%</p>
                        <div className="w-full bg-gray-200 h-2 rounded-full mb-2">
                        <div className="bg-indigo-600 h-2 rounded-full transition-all duration-1000" style={{ width: `${Math.min(parseFloat(stats.percentage), 100)}%` }}></div>
                        </div>
                    </div>
                    </div>
                </div>

                {/* Analytics Section */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Party Trends (Left Column) */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 lg:col-span-1">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">Party Share</h3>
                    <div className="space-y-4">
                        {parties.map(party => {
                        const count = stats.partyCounts[party.name] || 0;
                        const share = stats.voted > 0 ? (count / stats.voted) * 100 : 0;
                        return (
                            <div key={party.name} className="w-full group cursor-pointer" onClick={() => setAnalysisParty(party.name)}>
                            <div className="flex justify-between text-sm mb-1">
                                <span className={`font-semibold ${analysisParty === party.name ? 'text-indigo-600 underline' : 'text-gray-700'}`}>{party.name}</span>
                                <span className="text-gray-500">{count} ({share.toFixed(1)}%)</span>
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                                <div 
                                className="h-full rounded-full transition-all duration-500"
                                style={{ 
                                    width: `${share}%`, 
                                    backgroundColor: party.color,
                                    opacity: (analysisParty === 'OVERALL' || analysisParty === party.name) ? 1 : 0.3
                                }}
                                ></div>
                            </div>
                            </div>
                        );
                        })}
                    </div>
                    <button 
                        onClick={() => setAnalysisParty('OVERALL')}
                        className={`mt-6 w-full py-2 text-sm font-medium rounded-lg border ${analysisParty === 'OVERALL' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
                    >
                        Show Overall Turnout
                    </button>
                    </div>

                    {/* Detailed Demographics (Right 2 Columns) */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 lg:col-span-2">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold text-gray-800">
                                {analysisParty === 'OVERALL' ? 'Voter Turnout by Demographics' : `Voter Breakdown: ${analysisParty}`}
                            </h3>
                            <span className="text-xs px-2 py-1 bg-gray-100 rounded text-gray-500">
                                {analysisParty === 'OVERALL' ? 'Showing % of Registered Voters who Voted' : 'Showing composition of votes secured'}
                            </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* Gender Analysis */}
                            <div>
                                <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 border-b pb-2">Gender Wise</h4>
                                {['Male', 'Female'].map(gender => {
                                    const data = stats.demographics.gender[gender];
                                    const totalInGroup = data.total; 
                                    const votedCount = analysisParty === 'OVERALL' 
                                        ? data.voted 
                                        : (data.byParty[analysisParty] || 0);
                                    
                                    return renderDemographicBar(
                                        gender, 
                                        analysisParty === 'OVERALL' ? totalInGroup : (stats.partyCounts[analysisParty] || 0), 
                                        votedCount, 
                                        gender === 'Male' ? 'bg-blue-500' : 'bg-pink-500'
                                    );
                                })}
                            </div>
                            
                            {/* Age Analysis */}
                            <div>
                                <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 border-b pb-2">Age Group Wise</h4>
                                {['18-29', '30-45', '46-60', '60+'].map(ageGroup => {
                                    const data = stats.demographics.age[ageGroup];
                                    const totalInGroup = data.total;
                                    const votedCount = analysisParty === 'OVERALL' 
                                        ? data.voted 
                                        : (data.byParty[analysisParty] || 0);
                                    
                                    return renderDemographicBar(
                                        ageGroup,
                                        analysisParty === 'OVERALL' ? totalInGroup : (stats.partyCounts[analysisParty] || 0),
                                        votedCount,
                                        'bg-indigo-500'
                                    );
                                })}
                            </div>
                        </div>
                        
                        {analysisParty !== 'OVERALL' && (
                            <div className="mt-4 p-3 bg-indigo-50 rounded-lg text-sm text-indigo-800">
                                <strong>Analysis:</strong> You have secured <strong>{stats.partyCounts[analysisParty] || 0}</strong> votes. 
                                The charts above show the gender and age distribution of these specific voters.
                            </div>
                        )}
                    </div>
                </div>

                {/* Time-wise Turnout Chart (1 Minute intervals) */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-bold text-gray-800 mb-6">Real-time Voter Turnout (Minute by Minute)</h3>
                    <div className="h-64 w-full overflow-x-auto">
                        {turnoutTrend.length > 0 ? (
                            <div className="h-full min-w-[800px] flex items-end relative px-8 pb-8 pt-4">
                                <svg className="w-full h-full overflow-visible" preserveAspectRatio="none">
                                    {/* X and Y Axis */}
                                    <line x1="0" y1="100%" x2="100%" y2="100%" stroke="#e5e7eb" strokeWidth="2" />
                                    <line x1="0" y1="0" x2="0" y2="100%" stroke="#e5e7eb" strokeWidth="2" />

                                    {/* Vertical Grids for Hour and Half-Hour marks only */}
                                    {turnoutTrend.map((pt, idx) => {
                                        if (!pt.isHour && !pt.isHalfHour) return null;
                                        
                                        const x = turnoutTrend.length > 1 ? (idx / (turnoutTrend.length - 1)) * 100 : 50;
                                        return (
                                            <line 
                                                key={`grid-${idx}`}
                                                x1={`${x}%`} y1="0" x2={`${x}%`} y2="100%" 
                                                stroke={pt.isHour ? "#d1d5db" : "#f3f4f6"} 
                                                strokeWidth={pt.isHour ? "1.5" : "1"} 
                                                strokeDasharray={pt.isHour ? "" : "4 4"}
                                            />
                                        );
                                    })}

                                    {/* Trend Line (High Precision - plots every minute) */}
                                    <polyline 
                                        fill="none" 
                                        stroke="#4f46e5" 
                                        strokeWidth="2" 
                                        points={turnoutTrend.map((pt, idx) => {
                                            const maxPct = Math.max(...turnoutTrend.map(t => t.percentage)) * 1.2 || 10; 
                                            const x = turnoutTrend.length > 1 ? (idx / (turnoutTrend.length - 1)) * 100 : 50; 
                                            const y = 100 - ((pt.percentage / maxPct) * 100);
                                            return `${x}%,${y}%`;
                                        }).join(' ')}
                                        vectorEffect="non-scaling-stroke"
                                        strokeLinejoin="round"
                                        strokeLinecap="round"
                                    />

                                    {/* Labels for Hour Marks Only */}
                                    {turnoutTrend.map((pt, idx) => {
                                        if (!pt.isHour && idx !== turnoutTrend.length - 1) return null;
                                        
                                        const x = turnoutTrend.length > 1 ? (idx / (turnoutTrend.length - 1)) * 100 : 50;
                                        
                                        return (
                                            <g key={pt.timestamp} style={{ transformBox: 'fill-box' }}>
                                                {/* Time Label on X Axis */}
                                                <text x={`${x}%`} y="115%" textAnchor="middle" fill="#6b7280" fontSize="12" fontWeight="medium">
                                                    {pt.label}
                                                </text>
                                            </g>
                                        );
                                    })}
                                    
                                    {/* Current/Latest Data Point Tooltip (Always Visible) */}
                                    {(() => {
                                        if (turnoutTrend.length === 0) return null;
                                        const lastPt = turnoutTrend[turnoutTrend.length - 1];
                                        const maxPct = Math.max(...turnoutTrend.map(t => t.percentage)) * 1.2 || 10;
                                        const y = 100 - ((lastPt.percentage / maxPct) * 100);
                                        
                                        return (
                                            <g>
                                                 <circle cx="100%" cy={`${y}%`} r="5" fill="#4f46e5" stroke="white" strokeWidth="2" />
                                                 <text x="100%" y={`${y - 8}%`} textAnchor="end" fill="#4f46e5" fontSize="12" fontWeight="bold">
                                                    {lastPt.percentage.toFixed(1)}% ({lastPt.label})
                                                 </text>
                                            </g>
                                        )
                                    })()}
                                </svg>
                            </div>
                        ) : (
                            <div className="h-full flex items-center justify-center text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                                Start marking voters to generate real-time timeline.
                            </div>
                        )}
                    </div>
                </div>
          </div>
      )}

      {/* 2. VOTER LIST TAB */}
      {activeTab === 'LIST' && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden animate-fade-in">
            {/* Toolbar */}
            <div className="p-4 border-b border-gray-100 bg-gray-50 flex flex-col sm:flex-row gap-4 justify-between items-center">
            <div className="flex gap-2">
                <button onClick={() => setFilter('ALL')} className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${filter === 'ALL' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>All</button>
                <button onClick={() => setFilter('NOT_VOTED')} className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${filter === 'NOT_VOTED' ? 'bg-orange-500 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>Pending</button>
                <button onClick={() => setFilter('VOTED')} className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${filter === 'VOTED' ? 'bg-emerald-600 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>Voted</button>
            </div>
            <div className="relative w-full sm:w-64">
                <input 
                    type="text" 
                    placeholder="Search..." 
                    className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 outline-none"
                    value={searchTerm}
                    onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                />
                <svg className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </div>
            </div>

            {/* Table Body */}
            <div className="divide-y divide-gray-100">
                {paginatedVoters.map((voter) => (
                    <div key={`${voter.epic_no}-${voter.sl_no}`} className={`p-4 md:grid md:grid-cols-12 md:gap-4 items-center hover:bg-gray-50 transition-colors ${voter.isVoted ? 'bg-emerald-50/50' : ''}`}>
                        <div className="col-span-1 flex items-center gap-3 mb-2 md:mb-0">
                            <span className="font-mono font-bold text-gray-700">#{voter.sl_no}</span>
                            {voter.photoBase64 && (
                                <img src={voter.photoBase64} alt="" className="w-10 h-12 object-cover rounded border border-gray-200 hidden md:block" />
                            )}
                        </div>
                        <div className="col-span-3 mb-2 md:mb-0">
                            <h4 className="font-bold text-gray-900 font-telugu text-lg leading-tight">{voter.name_te}</h4>
                            <p className="text-sm text-gray-600 font-medium">{voter.name_en}</p>
                            <p className="text-xs text-gray-400 mt-1">EPIC: <span className="text-indigo-600 font-mono">{voter.epic_no}</span> • {voter.age} {voter.gender.charAt(0)}</p>
                        </div>
                        <div className="col-span-2 mb-2 md:mb-0">
                            <p className="text-xs font-semibold text-gray-700">H.No: {voter.house_no}</p>
                        </div>
                        <div className="col-span-2 mb-3 md:mb-0">
                            {voter.isVoted ? (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                                    Voted ({voter.votedParty})
                                </span>
                            ) : (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                    Not Voted
                                </span>
                            )}
                        </div>
                        <div className="col-span-4 flex flex-col gap-2">
                            <div className="flex flex-wrap justify-center gap-1">
                                {!voter.isVoted ? (
                                    parties.map(party => (
                                        <button
                                            key={party.name}
                                            onClick={() => handlePartySelect(voter, party.name)}
                                            className="px-2 py-1 text-xs font-bold text-white rounded shadow-sm hover:opacity-90 transition-opacity"
                                            style={{ backgroundColor: party.color }}
                                        >
                                            {party.name}
                                        </button>
                                    ))
                                ) : (
                                    <button 
                                        onClick={() => handleVoteToggle(voter)}
                                        className="text-xs text-red-600 hover:text-red-800 underline font-medium"
                                    >
                                        Undo Vote
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            {/* Pagination controls */}
            {totalPages > 1 && (
                <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-between items-center">
                    <button disabled={page === 1} onClick={() => setPage(page - 1)} className="px-3 py-1 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50">Previous</button>
                    <span className="text-sm text-gray-600">Page {page} of {totalPages}</span>
                    <button disabled={page === totalPages} onClick={() => setPage(page + 1)} className="px-3 py-1 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50">Next</button>
                </div>
            )}
          </div>
      )}

      {/* Party Configuration Modal */}
      {showPartyConfig && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md max-h-[80vh] overflow-y-auto">
                  <h3 className="text-xl font-bold mb-4">Configure Parties</h3>
                  <div className="space-y-3 mb-4">
                      {parties.map((p, idx) => (
                          <div key={idx} className="flex gap-2 items-center">
                              <input 
                                  type="color" 
                                  value={p.color} 
                                  onChange={(e) => updatePartyState(idx, 'color', e.target.value)}
                                  className="w-10 h-10 rounded cursor-pointer border-none"
                              />
                              <input 
                                  type="text" 
                                  value={p.name}
                                  onChange={(e) => updatePartyState(idx, 'name', e.target.value)}
                                  className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm"
                                  placeholder="Party Name"
                              />
                              <button 
                                onClick={() => removeParty(idx)}
                                className="text-red-500 hover:text-red-700 p-2"
                              >✕</button>
                          </div>
                      ))}
                  </div>
                  <button 
                    onClick={addParty}
                    className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:bg-gray-50 mb-4"
                  >
                      + Add New Party
                  </button>
                  <div className="flex gap-3">
                      <button 
                        onClick={() => setShowPartyConfig(false)}
                        className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 font-medium"
                      >
                          Save & Close
                      </button>
                  </div>
              </div>
          </div>
      )}
      <style>{`
          .animate-fade-in {
              animation: fadeIn 0.3s ease-in-out;
          }
          @keyframes fadeIn {
              from { opacity: 0; transform: translateY(10px); }
              to { opacity: 1; transform: translateY(0); }
          }
      `}</style>
    </div>
  );
};

export default Dashboard;

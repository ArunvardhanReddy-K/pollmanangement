import React, { useState, useEffect } from 'react';
import { Voter, ProcessingStatus, Party, DEFAULT_PARTIES } from './types';
import UploadZone from './components/UploadZone';
import Dashboard from './components/Dashboard';
import LoginScreen from './components/LoginScreen';
import { uploadPdfToCloud } from './services/apiService';
import { extractVotersFromImage } from './services/geminiService';
import { auth } from './services/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';

const App: React.FC = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userUid, setUserUid] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [voters, setVoters] = useState<Voter[]>([]);
  const [view, setView] = useState<'UPLOAD' | 'DASHBOARD'>('UPLOAD');
  const [parties, setParties] = useState<Party[]>(DEFAULT_PARTIES);
  const [concurrency, setConcurrency] = useState<number>(2); // Default to safer concurrency

  const [status, setStatus] = useState<ProcessingStatus>({
    total: 0,
    current: 0,
    message: '',
    isProcessing: false,
  });

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      // REQUIRE EMAIL VERIFICATION
      if (user && user.emailVerified) {
        setIsLoggedIn(true);
        setUserUid(user.uid);
      } else {
        setIsLoggedIn(false);
        setUserUid(null);
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Robust CSV Line Parser
  const parseCSVLine = (str: string, delimiter: string = ',') => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      
      for (let i = 0; i < str.length; i++) {
          const char = str[i];
          if (char === '"') {
              inQuotes = !inQuotes;
          } else if (char === delimiter && !inQuotes) {
              result.push(current.replace(/^"|"$/g, '').replace(/""/g, '"').trim());
              current = '';
          } else {
              current += char;
          }
      }
      result.push(current.replace(/^"|"$/g, '').replace(/""/g, '"').trim());
      return result;
  };

  // Generate CSV String from Voters
  const generateCSVContent = (votersData: Voter[]) => {
    const BOM = "\uFEFF"; 
    const headers = [
      'Serial No', 'EPIC No', 'Name (English)', 'Name (Telugu)', 'Relation Name', 
      'House No', 'Age', 'Gender', 'Assembly', 'Parliament', 'Polling Station', 
      'Voted?', 'Party', 'Page No', 'Timestamp'
    ];
    
    const rows = votersData.map(v => [
      v.sl_no, 
      v.epic_no, 
      `"${(v.name_en || "").replace(/"/g, '""')}"`, 
      `"${(v.name_te || "").replace(/"/g, '""')}"`,
      `"${(v.relative_name || "").replace(/"/g, '""')}"`, 
      `"${(v.house_no || "").replace(/"/g, '""')}"`,
      v.age, 
      v.gender, 
      `"${(v.assembly_name || "").replace(/"/g, '""')}"`, 
      `"${(v.parliament_name || "").replace(/"/g, '""')}"`,
      `"${(v.polling_station_no || "").replace(/"/g, '""')}"`,
      v.isVoted ? 'YES' : 'NO', 
      v.votedParty || '', 
      v.originalPage,
      v.timestamp || ''
    ].join(','));

    return BOM + [headers.join(','), ...rows].join('\n');
  };

  // Reusable CSV Processor
  const processCSVText = (text: string, source: 'API' | 'FILE' | 'HISTORY') => {
      if (text.charCodeAt(0) === 0xFEFF) {
        text = text.slice(1);
      }

      const lines = text.split(/\r\n|\n|\r/).filter(line => line.trim().length > 0);
      
      if (lines.length < 2) {
         throw new Error("Data appears to be empty or missing headers.");
      }

      const firstLine = lines[0];
      const delimiter = firstLine.includes(';') ? ';' : ',';

      const dataLines = lines.slice(1);
      const loadedVoters: Voter[] = [];
      
      for (const line of dataLines) {
          const cols = parseCSVLine(line, delimiter);
          if (cols.length < 3) continue;
          
          loadedVoters.push({
             sl_no: cols[0] || "",
             epic_no: cols[1] || "",
             name_en: cols[2] || "",
             name_te: cols[3] || "",
             relative_name: cols[4] || "",
             house_no: cols[5] || "",
             age: cols[6] || "",
             gender: cols[7] || "",
             assembly_name: cols[8] || "",
             parliament_name: cols[9] || "",
             polling_station_no: cols[10] || "",
             isVoted: cols[11]?.toUpperCase() === 'YES',
             votedParty: (cols[12] && cols[12] !== 'null' && cols[12] !== '') ? cols[12] : null,
             originalPage: cols[13] ? parseInt(cols[13]) : 0,
             photoBase64: undefined 
         });
      }

      if (loadedVoters.length === 0) {
          throw new Error("No valid voter records parsed.");
      }

      setVoters(loadedVoters);
      setStatus({
          total: 0,
          current: 0,
          message: source === 'API' ? 'Extraction Complete!' : 'Data Loaded Successfully',
          isProcessing: false
      });
      
      if (source === 'FILE' || source === 'HISTORY') {
          setView('DASHBOARD');
      }
      return loadedVoters;
  };

  // --- LOCAL PDF PROCESSING ENGINE (FALLBACK) ---
  
  const getPdfPageAsBase64 = async (pdf: any, pageNum: number, scale: number = 2.5): Promise<string> => {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    if (!context) throw new Error("Canvas context failed");

    await page.render({ canvasContext: context, viewport: viewport }).promise;
    const base64 = canvas.toDataURL('image/jpeg', 0.8);
    page.cleanup();
    return base64.split(',')[1];
  };

  const processPdfLocally = async (file: File) => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const totalPages = pdf.numPages;

    setStatus({
        total: totalPages,
        current: 0,
        message: 'Starting Local Extraction...',
        isProcessing: true
    });

    const allVoters: Voter[] = [];
    const pageQueue = Array.from({ length: totalPages }, (_, i) => i + 1).slice(2); 

    const processBatch = async () => {
        while (pageQueue.length > 0) {
            const batch = pageQueue.splice(0, concurrency);
            const promises = batch.map(async (pageNum) => {
                try {
                    const base64 = await getPdfPageAsBase64(pdf, pageNum);
                    setStatus(prev => ({
                        ...prev,
                        current: prev.current + 1,
                        message: `Processing Page ${pageNum} of ${totalPages}...`
                    }));
                    const pageVoters = await extractVotersFromImage(base64, pageNum, false); 
                    if (pageVoters.length > 0) {
                        allVoters.push(...pageVoters);
                        setVoters(prev => [...prev, ...pageVoters]);
                    }
                } catch (err) {
                    console.error(`Error processing page ${pageNum}:`, err);
                }
            });
            await Promise.all(promises);
        }
    };

    await processBatch();

    if (allVoters.length === 0) {
        setStatus({
            total: totalPages,
            current: totalPages,
            message: 'No voters found. Please try a different PDF or Quality.',
            isProcessing: false
        });
    }
  };

  // --- MAIN HANDLER ---

  const handleFileUpload = async (file: File) => {
    if (!file) return;
    setVoters([]); 

    try {
      // 1. Try Cloud API First
      setStatus({
        total: 0,
        current: 0,
        message: 'Connecting to Cloud Engine...',
        isProcessing: true,
      });

      const csvResponse = await uploadPdfToCloud(file);
      setStatus(prev => ({ ...prev, message: 'Processing Response Data...' }));
      const loadedVoters = processCSVText(csvResponse, 'API');

    } catch (error: any) {
      console.warn("Cloud API Failed, switching to local:", error);
      
      // 2. Fallback to Local Processing
      setStatus(prev => ({
        ...prev,
        message: `Switching to Local Engine...`,
      }));
      
      setTimeout(() => {
          processPdfLocally(file).catch(localErr => {
              console.error(localErr);
              setStatus({
                  total: 0,
                  current: 0,
                  message: `Critical Error: ${localErr.message}`,
                  isProcessing: false
              });
          });
      }, 1500);
    }
  };

  const handleDataFileSelect = async (file: File) => {
      if (!file) return;
      setStatus({ total: 0, current: 0, message: 'Reading Local CSV...', isProcessing: true });
      try {
          const text = await file.text();
          processCSVText(text, 'FILE');
      } catch (error: any) {
          console.error("Error parsing CSV", error);
          setStatus({
              total: 0,
              current: 0,
              message: `Error loading CSV: ${error.message}`,
              isProcessing: false
          });
      }
  };

  const updateVoter = (updatedVoter: Voter) => {
    setVoters(prevVoters => 
        prevVoters.map(v => (v.epic_no === updatedVoter.epic_no ? updatedVoter : v))
    );
  };

  const addVoter = (newVoter: Voter) => {
    setVoters(prev => [...prev, newVoter]);
  };

  const downloadCSV = () => {
    if (voters.length === 0) {
        alert("No voters data to download.");
        return;
    }
    const csvContent = generateCSVContent(voters);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `polling_data_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleLogout = () => {
      signOut(auth).then(() => {
          setIsLoggedIn(false);
          setView('UPLOAD');
          setVoters([]);
      });
  };

  if (authLoading) {
      return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full"></div></div>;
  }

  if (!isLoggedIn) {
      return <LoginScreen onLogin={() => {}} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* Header */}
      <header className="bg-indigo-900 text-white shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView('UPLOAD')}>
              <div className="bg-white p-2 rounded-full">
                <svg className="w-6 h-6 text-indigo-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">AswaMithra Polling Dashboard</h1>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
               {voters.length > 0 && (
                   <button 
                    onClick={downloadCSV}
                    className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                   >
                       <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                       Download Data
                   </button>
               )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        
        {view === 'UPLOAD' ? (
            <div className="max-w-3xl mx-auto space-y-8">
              <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
                <div className="text-center mb-8">
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Initialize Polling Booth</h2>
                    <p className="text-gray-500">Upload Electoral Roll PDF to process and digitize voter data.</p>
                </div>
                
                {/* Configuration Options */}
                <div className="mb-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
                   {/* Speed Control for Local Fallback */}
                   <div className="border rounded-lg p-3">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Processing Speed (Parallel Pages)</label>
                        <div className="grid grid-cols-5 gap-1">
                            {[2, 5, 10, 20, 30].map(num => (
                                <button
                                    key={num}
                                    onClick={() => setConcurrency(num)}
                                    className={`py-1 text-xs font-bold rounded ${concurrency === num ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                    title={num === 30 ? "Warning: High memory usage" : ""}
                                >
                                    {num}
                                </button>
                            ))}
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1">
                            {concurrency <= 5 ? 'Recommended for most devices' : concurrency <= 10 ? 'Fast (Good Connection)' : 'Extreme (High RAM Required)'}
                        </p>
                   </div>
                </div>

                <UploadZone 
                    onFileSelect={handleFileUpload} 
                    onDataFileSelect={handleDataFileSelect}
                    isProcessing={status.isProcessing} 
                />
                
                {status.message && (
                    <div className={`mt-8 p-4 rounded-lg border ${status.message.includes('Error') || status.message.includes('No voters') ? 'bg-red-50 border-red-200' : 'bg-indigo-50 border-indigo-200'}`}>
                        <div className="flex justify-between text-sm mb-2">
                            <span className={`font-medium ${status.isProcessing ? 'text-indigo-600 animate-pulse' : (status.message.includes('Error') ? 'text-red-600' : 'text-gray-700')}`}>
                            {status.message}
                            </span>
                            {status.total > 0 && (
                                <span className="text-gray-500">{Math.round((status.current / status.total) * 100)}%</span>
                            )}
                        </div>
                        {status.isProcessing && (
                            <div className="w-full bg-white rounded-full h-3 overflow-hidden border border-indigo-100">
                                <div 
                                    className="h-full bg-indigo-600 transition-all duration-300 rounded-full"
                                    style={{ width: status.total > 0 ? `${(status.current / status.total) * 100}%` : '100%' }}
                                ></div>
                            </div>
                        )}
                        
                        {!status.isProcessing && (status.message.includes('Error') || status.message.includes('No voters')) && (
                            <div className="mt-4 flex justify-end">
                                <button 
                                    onClick={() => setStatus({ total: 0, current: 0, message: '', isProcessing: false })}
                                    className="text-sm text-red-700 font-semibold hover:underline"
                                >
                                    Reset / Try Again
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* Show Success UI if extraction complete OR if voters were found */}
                {!status.isProcessing && (status.message.includes('Extraction Complete') || status.message.includes('Data Loaded') || voters.length > 0) && (
                     <div className="mt-8 text-center animate-fade-in-up border-t border-gray-100 pt-8">
                        <h3 className="text-xl font-bold text-gray-900 mb-2">Processing Complete</h3>
                        <p className="text-gray-600 mb-6">Successfully loaded {voters.length} voters.</p>
                        
                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <button
                                onClick={downloadCSV}
                                className="bg-white border-2 border-gray-300 text-gray-700 text-lg font-semibold px-6 py-3 rounded-xl hover:bg-gray-50 transition-all"
                            >
                                Download CSV Only
                            </button>
                            <button
                                onClick={() => setView('DASHBOARD')}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white text-lg font-semibold px-8 py-3 rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
                            >
                                Enter Polling Dashboard →
                            </button>
                        </div>
                    </div>
                )}
            </div>
            </div>
        ) : (
            <Dashboard 
                voters={voters} 
                onUpdateVoter={updateVoter}
                onAddVoter={addVoter}
                parties={parties}
                onUpdateParties={setParties}
                onLogout={handleLogout}
            />
        )}
      </main>
      <style>{`
        @keyframes indeterminate-bar {
            0% { width: 0%; margin-left: 0%; }
            50% { width: 50%; margin-left: 25%; }
            100% { width: 0%; margin-left: 100%; }
        }
        .animate-indeterminate-bar {
            animation: indeterminate-bar 1.5s infinite ease-in-out;
        }
      `}</style>
    </div>
  );
};

export default App;
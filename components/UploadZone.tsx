import React from 'react';

interface UploadZoneProps {
  onFileSelect: (file: File) => void;
  onDataFileSelect?: (file: File) => void;
  isProcessing: boolean;
}

const UploadZone: React.FC<UploadZoneProps> = ({ onFileSelect, isProcessing }) => {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
    }
  };

  return (
    <div className="w-full space-y-6">
      <label 
        htmlFor="pdf-upload" 
        className={`flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer transition-colors duration-200
          ${isProcessing 
            ? 'bg-gray-50 border-gray-300 cursor-not-allowed' 
            : 'bg-white border-indigo-300 hover:bg-indigo-50 hover:border-indigo-400'
          }`}
      >
        <div className="flex flex-col items-center justify-center pt-5 pb-6">
          <svg className={`w-10 h-10 mb-3 ${isProcessing ? 'text-gray-400' : 'text-indigo-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
          </svg>
          <p className="mb-2 text-sm text-gray-500">
            <span className="font-semibold">Click to upload Electoral Roll PDF</span>
          </p>
          <p className="text-xs text-gray-400">PDF files only (Max 300MB)</p>
        </div>
        {/* Updated accept attribute for better Android compatibility */}
        <input 
          id="pdf-upload" 
          type="file" 
          accept="application/pdf,.pdf"
          className="hidden" 
          onChange={handleFileChange}
          disabled={isProcessing}
          onClick={(e) => (e.target as HTMLInputElement).value = ''}
        />
      </label>
    </div>
  );
};

export default UploadZone;
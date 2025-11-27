import React from 'react';
import { Voter } from '../types';

interface VoterCardProps {
  voter: Voter;
}

const VoterCard: React.FC<VoterCardProps> = ({ voter }) => {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex gap-4 hover:shadow-md transition-shadow duration-200">
      <div className="flex-shrink-0">
        {voter.photoBase64 ? (
          <img 
            src={voter.photoBase64} 
            alt={voter.name_en} 
            className="w-20 h-24 object-cover rounded-md border border-gray-300 bg-gray-100"
          />
        ) : (
          <div className="w-20 h-24 bg-gray-100 rounded-md border border-gray-300 flex items-center justify-center text-gray-400">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
            </svg>
          </div>
        )}
        <div className="mt-2 text-xs text-center text-gray-500 font-mono">
          {voter.sl_no}
        </div>
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-start">
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
            {voter.epic_no}
          </span>
          <span className="text-xs text-gray-400">
             #{voter.house_no}
          </span>
        </div>
        
        <h3 className="mt-2 text-lg font-bold text-gray-900 truncate font-telugu text-indigo-900 leading-tight">
          {voter.name_te}
        </h3>
        <p className="text-sm font-medium text-gray-700 truncate">
          {voter.name_en}
        </p>
        
        <div className="mt-3 flex items-center text-xs text-gray-500 space-x-3">
          <div className="flex items-center">
            <span className="font-semibold mr-1">Age:</span> {voter.age}
          </div>
          <div className="flex items-center">
            <span className="font-semibold mr-1">Sex:</span> {voter.gender}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VoterCard;

import React, { useState } from 'react';
import { auth, db } from '../services/firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendEmailVerification, 
  signOut, 
  sendPasswordResetEmail
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';

interface LoginScreenProps {
  onLogin: () => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [isLoginView, setIsLoginView] = useState(true);
  const [isResetView, setIsResetView] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // Verification State
  const [verificationSent, setVerificationSent] = useState(false);
  const [emailToVerify, setEmailToVerify] = useState('');

  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [regName, setRegName] = useState('');
  const [regBooth, setRegBooth] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Sync with Firestore: If user exists in Auth but not DB, add them.
      // Note: We only have email/password here.
      try {
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (!userDoc.exists()) {
          await setDoc(userDocRef, {
            email: email,
            password: password, // Storing as requested, though usually skipped for security
            createdAt: new Date().toISOString(),
            migratedAt: new Date().toISOString()
          });
        }
      } catch (dbErr) {
        console.error("Firestore sync error during login:", dbErr);
        // Continue login process even if DB sync fails
      }

      // Check for email verification
      if (!user.emailVerified) {
        // If not verified, ensure verification email is sent and sign out
        try {
            await sendEmailVerification(user);
        } catch (err) {
            console.log("Verification email already sent or error:", err);
        }
        
        await signOut(auth);
        
        setEmailToVerify(email);
        setVerificationSent(true);
        setIsLoading(false);
        return;
      }

      // If verified, App.tsx auth listener will handle the transition
    } catch (err: any) {
      console.error("Login error:", err);
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-email') {
        setError('Password or Email Incorrect');
      } else if (err.code === 'auth/unauthorized-domain' || err.code === 'auth/operation-not-allowed') {
        setError('Domain not authorized. Add this domain in Firebase Console -> Auth -> Settings.');
      } else {
        setError('Login failed. Please check your connection.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName || !email || !password) {
        setError('Please fill all required fields');
        return;
    }
    setError('');
    setIsLoading(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Save user details to Firestore
      try {
        await setDoc(doc(db, "users", user.uid), {
          name: regName,
          email: email,
          password: password, // Storing as requested
          booth_number: regBooth,
          uid: user.uid,
          createdAt: new Date().toISOString()
        });
      } catch (dbErr) {
        console.error("Firestore save error:", dbErr);
        // We continue flow even if DB write fails, but warn
      }
      
      // Send verification email
      await sendEmailVerification(user);
      
      // Sign out immediately so user is not logged in automatically
      await signOut(auth);

      // Show verification screen
      setEmailToVerify(email);
      setVerificationSent(true);

    } catch (err: any) {
      console.error("Registration error:", err);
      if (err.code === 'auth/email-already-in-use') {
        setError('User already exists. Sign in?');
      } else if (err.code === 'auth/weak-password') {
        setError('Password should be at least 6 characters.');
      } else if (err.code === 'auth/unauthorized-domain' || err.code === 'auth/operation-not-allowed') {
        setError('Domain not authorized. Add this domain in Firebase Console -> Auth -> Settings.');
      } else {
        setError(err.message || 'Registration failed.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!email) {
          setError('Please enter your email address to reset password.');
          return;
      }
      setError('');
      setIsLoading(true);

      try {
          await sendPasswordResetEmail(auth, email);
          setResetSuccess(true);
      } catch (err: any) {
          console.error("Reset password error:", err);
          if (err.code === 'auth/user-not-found') {
              setError('No account found with this email.');
          } else if (err.code === 'auth/invalid-email') {
              setError('Invalid email address.');
          } else {
              setError(err.message || 'Failed to send reset link.');
          }
      } finally {
          setIsLoading(false);
      }
  };

  if (verificationSent) {
      return (
        <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-indigo-900 p-4 rounded-full w-16 h-16 mx-auto flex items-center justify-center shadow-lg">
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                </div>
                <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                    Verify your email
                </h2>
            </div>
            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 text-center">
                    <p className="text-gray-600 mb-6 text-lg">
                        We have sent you a verification email to <span className="font-bold text-gray-900">{emailToVerify}</span>. 
                        Verify it and log in.
                    </p>
                    <button 
                        onClick={() => {
                            setVerificationSent(false);
                            setIsLoginView(true);
                            setError('');
                            setEmail(emailToVerify); // Pre-fill email for convenience
                        }}
                        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                        Login
                    </button>
                </div>
            </div>
        </div>
      );
  }

  if (resetSuccess) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
          <div className="sm:mx-auto sm:w-full sm:max-w-md">
              <div className="bg-indigo-900 p-4 rounded-full w-16 h-16 mx-auto flex items-center justify-center shadow-lg">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
              </div>
              <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                  Check your email
              </h2>
          </div>
          <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
              <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 text-center">
                  <p className="text-gray-600 mb-6 text-lg">
                      We sent you a password change link to <span className="font-bold text-gray-900">{email}</span>.
                  </p>
                  <button 
                      onClick={() => {
                          setResetSuccess(false);
                          setIsResetView(false);
                          setIsLoginView(true);
                          setError('');
                      }}
                      className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                      Sign In
                  </button>
              </div>
          </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-indigo-900 p-4 rounded-full w-16 h-16 mx-auto flex items-center justify-center shadow-lg">
           <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          {isResetView ? 'Reset Password' : (isLoginView ? 'Sign in to Polling Booth' : 'Agent Registration')}
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          AswaMithra Polling Dashboard
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          
          {/* Tabs */}
          {!isResetView && (
              <div className="flex border-b border-gray-200 mb-6">
                  <button 
                    onClick={() => { setIsLoginView(true); setError(''); }}
                    className={`flex-1 py-2 text-sm font-medium text-center ${isLoginView ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                      Login
                  </button>
                  <button 
                    onClick={() => { setIsLoginView(false); setError(''); }}
                    className={`flex-1 py-2 text-sm font-medium text-center ${!isLoginView ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                      Register
                  </button>
              </div>
          )}

          {isResetView ? (
              <form className="space-y-6" onSubmit={handlePasswordReset}>
                  <div>
                    <p className="text-sm text-gray-600 mb-4">
                        Enter your email address and we'll send you a link to reset your password.
                    </p>
                    <label className="block text-sm font-medium text-gray-700">Email Address</label>
                    <div className="mt-1">
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      />
                    </div>
                  </div>

                  {error && (
                    <div className="text-red-500 text-sm text-center bg-red-50 p-2 rounded border border-red-200">
                      {error}
                    </div>
                  )}

                  <button 
                    type="submit" 
                    disabled={isLoading}
                    className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${isLoading ? 'opacity-75 cursor-not-allowed' : ''}`}
                  >
                    {isLoading ? 'Sending Link...' : 'Get Reset Link'}
                  </button>

                  <div className="text-center mt-2">
                      <button 
                          type="button" 
                          onClick={() => { setIsResetView(false); setError(''); }}
                          className="text-sm font-medium text-gray-600 hover:text-gray-500"
                      >
                          Back to Sign In
                      </button>
                  </div>
              </form>
          ) : isLoginView ? (
              <form className="space-y-6" onSubmit={handleLogin}>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email Address</label>
                  <div className="mt-1">
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Password</label>
                  <div className="mt-1">
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end">
                    <button 
                        type="button" 
                        onClick={() => { setIsResetView(true); setError(''); }} 
                        className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
                    >
                        Forgot password?
                    </button>
                </div>

                {error && (
                  <div className="text-red-500 text-sm text-center bg-red-50 p-2 rounded border border-red-200">
                    {error}
                  </div>
                )}

                <button 
                  type="submit" 
                  disabled={isLoading}
                  className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${isLoading ? 'opacity-75 cursor-not-allowed' : ''}`}
                >
                  {isLoading ? 'Signing In...' : 'Access Dashboard'}
                </button>
              </form>
          ) : (
              <form className="space-y-6" onSubmit={handleRegister}>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Full Name</label>
                    <input
                        type="text"
                        required
                        value={regName}
                        onChange={(e) => setRegName(e.target.value)}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Email Address</label>
                    <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Password</label>
                    <input
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Booth Number</label>
                    <input
                        type="text"
                        value={regBooth}
                        onChange={(e) => setRegBooth(e.target.value)}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    />
                  </div>
                  
                  {error && (
                    <div className="text-red-500 text-sm text-center bg-red-50 p-2 rounded border border-red-200">
                      {error}
                    </div>
                  )}
                  
                  <button 
                    type="submit" 
                    disabled={isLoading}
                    className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 ${isLoading ? 'opacity-75 cursor-not-allowed' : ''}`}
                  >
                    {isLoading ? 'Registering...' : 'Register Agent'}
                  </button>
              </form>
          )}

        </div>
      </div>
    </div>
  );
};

export default LoginScreen;

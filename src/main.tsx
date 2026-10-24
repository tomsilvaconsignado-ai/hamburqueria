import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {initializeStorageIfEmpty} from './services/storage';
import './index.css';

// Antes do primeiro render: semeia o modo demonstração ou inicia a sincronização com o Supabase
initializeStorageIfEmpty();

createRoot(document.getElementById('root')!).render(<App />);

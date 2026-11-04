import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {initializeStorageIfEmpty} from './services/storage';
import {registerServiceWorker} from './lib/push';
import {unlockSoundsOnFirstTouch} from './lib/sounds';
import './index.css';

// Antes do primeiro render: semeia o modo demonstração ou inicia a sincronização com o Supabase
initializeStorageIfEmpty();
// Notificações push da equipe e liberação dos sons da loja no primeiro toque
registerServiceWorker();
unlockSoundsOnFirstTouch();

createRoot(document.getElementById('root')!).render(<App />);

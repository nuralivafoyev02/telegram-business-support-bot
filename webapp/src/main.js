import { createApp } from 'vue';
import App from './App.vue';
import './styles.css';

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then(registrations => {
      registrations
        .filter(registration => {
          try {
            return new URL(registration.scope).origin === window.location.origin;
          } catch (_error) {
            return false;
          }
        })
        .forEach(registration => registration.unregister());
    })
    .catch(error => console.warn('[webapp:service-worker-cleanup:error]', error));
}

createApp(App).mount('#app');

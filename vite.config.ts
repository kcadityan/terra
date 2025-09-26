import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 5173,
    host: true, // allows external access (0.0.0.0)
    allowedHosts: [
      'ef606212a268.ngrok-free.app' // add your ngrok domain here
    ]
  }
})

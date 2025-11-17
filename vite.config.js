export default {
  build: {
    target: 'esnext',
    minify: 'false',
    rollupOptions: {
      input: {
        main: 'index.html',
        embed: 'embed.html'
      },
    }
  },
  server: {
    host: 'nsix.test',
    port: 5080,
    strictPort: true,
    open: true
  }
}
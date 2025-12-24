import antfu from '@antfu/eslint-config'

export default antfu({
  pnpm: true,
  typescript: true,
  rules: {
    'node/prefer-global/buffer': 'off',
    'node/prefer-global/process': 'off',
    'node/prefer-global/global': 'off',
  },
})

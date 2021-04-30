export default {
  require: ['ts-node/register', 'tsconfig-paths/register'],
  typescript: {
    rewritePaths: {
      'src/': 'build/'
    }
  }
};

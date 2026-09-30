/**
 * "server-only" is resolved by Next's bundler (next/dist/compiled/server-only)
 * rather than installed as a package: importing it from a module that ends up
 * in a client bundle fails the build. It exports nothing.
 */
declare module "server-only";

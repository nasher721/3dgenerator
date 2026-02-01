/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    // Handle ONNX runtime for browser
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };

      // Handle WASM files
      config.module.rules.push({
        test: /\.wasm$/,
        type: 'asset/resource',
      });

      // Disable minification for ONNX runtime compatibility
      // The ONNX bundle uses import.meta which terser doesn't handle well
      config.optimization.minimize = false;
    }

    // Ignore node-specific modules in browser
    config.resolve.alias = {
      ...config.resolve.alias,
      'sharp$': false,
      'onnxruntime-node$': false,
    };

    return config;
  },
};

export default nextConfig;

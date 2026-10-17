import rootConfig from "../../eslint.config.mjs";

export default [
  ...rootConfig,
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
        projectService: {
          allowDefaultProject: ["src/crm-private-auth-order.test.mjs"],
          defaultProject: "tsconfig.json",
        },
      },
    },
  },
];

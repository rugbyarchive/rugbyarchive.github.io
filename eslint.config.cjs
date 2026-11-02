module.exports=[{
  ignores:['data/**','node_modules/**','branding/**']
},{
  files:['assets/**/*.js','tests/**/*.cjs'],
  languageOptions:{ecmaVersion:'latest',sourceType:'script'},
  rules:{'no-eval':'error','no-new-func':'error','no-implied-eval':'error','no-script-url':'error','no-dupe-args':'error','no-unreachable':'error'}
}];

# Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Configuração do Supabase (login e armazenamento de dados)

O app usa o [Supabase](https://supabase.com) para autenticação (e-mail/senha) e para
guardar os registros de ponto de cada usuário. Siga os passos abaixo antes de rodar
o projeto:

1. Crie um projeto gratuito em [app.supabase.com](https://app.supabase.com).
2. Em **Project Settings > API**, copie a **Project URL** e a chave **anon public**.
3. Copie `.env.example` para `.env.local` e preencha com esses valores:

   ```
   REACT_APP_SUPABASE_URL=https://seu-projeto.supabase.co
   REACT_APP_SUPABASE_ANON_KEY=sua-chave-anon-publica
   ```

   O `.env.local` já está no `.gitignore` — nunca commite suas credenciais.

4. No painel do Supabase, abra o **SQL Editor** e execute o conteúdo de
   [`supabase/schema.sql`](./supabase/schema.sql). Isso cria a tabela
   `timesheet_data` (uma linha por usuário, com os registros de ponto, a meta
   de horas e a preferência de tema) e as políticas de **Row Level Security**
   que garantem que cada usuário só acesse os próprios dados.
5. (Opcional) Em **Authentication > Providers**, confirme que o provedor
   **Email** está habilitado. Por padrão o Supabase exige confirmação por
   e-mail no cadastro — você pode desativar isso em
   **Authentication > Settings** durante o desenvolvimento, se preferir.
6. Rode `npm install` e depois `npm start`. A tela de login/cadastro aparece
   automaticamente; após autenticar, os dados são salvos e carregados do
   Supabase em vez do `localStorage`.

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)

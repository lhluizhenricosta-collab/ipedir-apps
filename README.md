# Apps do iPedir (Capacitor + Codemagic)

Um projeto só monta todos os apps: os 3 do iPedir e os apps próprios de loja e de agência.
O app é uma "casca" nativa que abre o site, com 3 recursos nativos:

- **Push pelo Firebase** (Android e iPhone), com som alto para pedido novo e corrida.
- **GPS do entregador em segundo plano** (só no iPedir Entregador), com o aviso fixo "Você está online".
- **Tela de sem conexão**, em vez da página de erro do navegador.

O site percebe que está dentro do app pelo `resources/js/app-bridge.js` do Laravel.

| Arquivo em `apps/` | App | Abre |
|---|---|---|
| `ipedir-delivery.json` | iPedir Delivery | o marketplace |
| `ipedir-entregador.json` | iPedir Entregador | o login (painel do entregador) |
| `ipedir-parceiros.json` | iPedir Parceiros | o login (lojista, afiliado, agência) |
| `app-loja-12.json` etc. | App próprio | baixado no painel do Master |

> **Antes de tudo:** troque `https://ipedir.lhmidia.com` pelo domínio definitivo nos 3 arquivos, se for outro.
> Coloque os ícones em `apps/icons/` (veja o LEIA-ME de lá).

---

## 1. Uma vez só: subir o projeto para o GitHub
1. Crie um repositório **privado** no GitHub, por exemplo `ipedir-apps`.
2. Envie esta pasta inteira para lá (o `.gitignore` já deixa de fora o que não deve subir).
3. No Codemagic, entre com a conta do GitHub, clique em **Add application** e escolha o repositório.
   Ele acha o `codemagic.yaml` sozinho.

## 2. Uma vez por app do iPedir: Firebase
1. Em https://console.firebase.google.com crie **um projeto por app**: `ipedir-delivery`, `ipedir-entregador` e `ipedir-parceiros`.
2. Em cada projeto, adicione:
   - um app **Android**, com o mesmo `appId` do JSON (ex.: `br.com.ipedir.delivery`). Baixe o `google-services.json`;
   - um app **Apple**, com o mesmo `iosBundleId`. Baixe o `GoogleService-Info.plist`.
3. **Push no iPhone:** na Apple (Certificates, IDs & Profiles › Keys), crie uma chave com **Apple Push Notifications service (APNs)** e baixe o `.p8`.
   No Firebase › Configurações do projeto › Cloud Messaging › app Apple, envie o `.p8` com o Key ID e o Team ID.
   Uma chave serve para todos os apps da mesma conta Apple.
4. **Para o servidor mandar push:** Firebase › Configurações do projeto › **Contas de serviço** › **Gerar nova chave privada**.
   Salve o `.json` no servidor, fora da pasta `public`, e aponte no `.env` do Laravel (veja o LEIA-ME do pacote Laravel).
5. No Codemagic › **Environment variables**, crie o grupo `firebase_delivery` (e `firebase_entregador`, `firebase_parceiros`) com:
   - `GOOGLE_SERVICES_JSON` = conteúdo do `google-services.json` em base64 (no Mac/Linux: `base64 -i google-services.json`);
   - `GOOGLE_SERVICE_INFO_PLIST` = conteúdo do `GoogleService-Info.plist` em base64.
   Marque as duas como **Secret**.

## 3. Uma vez: Google Play
1. Codemagic › **Code signing identities** › **Android keystores** › **Generate keystore**. Dê o nome `ipedir_keystore`.
   **Baixe e guarde uma cópia em lugar seguro:** sem ela não dá para atualizar os apps nunca mais.
2. Play Console › crie os 3 apps, com o mesmo nome de pacote do JSON.
3. Play Console › Configuração › Acesso à API › crie uma conta de serviço com permissão de **Administrador de versões**.
   Baixe o JSON e crie no Codemagic o grupo `google_play` com `GCLOUD_SERVICE_ACCOUNT_CREDENTIALS` = conteúdo do JSON.
4. **A 1ª versão de cada app** precisa ser enviada à mão no Play Console (o Google exige). Rode o workflow,
   baixe o `.aab` em **Artifacts** e envie em Testes › Teste interno. Da 2ª versão em diante, o Codemagic envia sozinho.

## 4. Uma vez: App Store
1. App Store Connect › Usuários e acesso › **Integrações** › **App Store Connect API** › gere uma chave com acesso **Administrador**.
2. Crie no Codemagic o grupo `app_store` com:
   - `APP_STORE_CONNECT_ISSUER_ID`, `APP_STORE_CONNECT_KEY_IDENTIFIER` e `APP_STORE_CONNECT_PRIVATE_KEY` (conteúdo do `.p8`);
   - `CERTIFICATE_PRIVATE_KEY`: uma chave RSA nova (no Mac/Linux: `ssh-keygen -t rsa -b 2048 -m PEM -f cert_key -q -N ""` e cole o conteúdo do arquivo `cert_key`).
3. Em Certificates, IDs & Profiles › Identifiers, registre os 3 Bundle IDs e marque **Push Notifications**.
4. App Store Connect › Apps › **+** › crie os 3 apps com os mesmos Bundle IDs.

## 5. Gerar e enviar uma versão
Codemagic › escolha o workflow (ex.: **Android · iPedir Delivery** ou **iPhone · iPedir Delivery**) › **Start new build**.
- Android: o `.aab` vai para o **teste interno** do Play Console. Depois é só promover para produção.
- iPhone: o `.ipa` vai para o **TestFlight**. Depois envie para revisão no App Store Connect.

O número da versão (`version` no JSON) é o que o cliente vê, e o número do build sobe sozinho a cada compilação.
Para lançar uma versão nova, mude `version` (ex.: `1.0.1`) e rode o workflow.

> Como o app abre o site, **quase tudo que você muda no Laravel aparece no app na hora, sem enviar versão nova**.
> Só precisa de versão nova quando mudar ícone, nome, cor da abertura ou algo nativo.

## 6. App próprio de loja ou agência
1. Painel do Master › **Apps nas Lojas** › abrir o pedido:
   - preencha o **pacote Android** e o **Bundle ID iOS** (ex.: `br.com.petamigo.app`);
   - envie o **Firebase** (conta de serviço do projeto Firebase deste app);
   - clique em **Baixar configuração do app (Codemagic)** e salve o arquivo em `apps/` neste projeto (ex.: `apps/app-loja-12.json`).
2. Crie um projeto no Firebase para o app, como no passo 2, mas usando a **conta Apple e a conta Google do cliente** (o iPedir foi convidado como Administrador).
3. No Codemagic, crie os grupos do cliente:
   - `cliente_firebase`, com os arquivos do Firebase do app;
   - `cliente_play`, com a conta de serviço do Play Console **do cliente**;
   - `cliente_apple`, com a chave da App Store Connect API **do cliente**;
   - e um keystore só deste cliente.
   Para não misturar clientes, você pode duplicar os dois workflows `*-white-label` no `codemagic.yaml` com o nome do cliente.
4. Rode **Android · App próprio** e **iPhone · App próprio** com `APP` = nome do arquivo (ex.: `app-loja-12`).

## Rodar no seu computador (opcional)
Precisa de Node 20, Android Studio (para Android) e um Mac com Xcode (para iPhone).
```bash
npm install
node scripts/prepare.mjs --app ipedir-delivery --platform android
npx cap add android
npx capacitor-assets generate --android
node scripts/patch-android.mjs
npx cap open android
```

## Atenção nas lojas
- **Google Play, app Entregador:** a Play pede uma declaração de "serviço em primeiro plano de localização" e um vídeo curto
  mostrando o entregador ficando online e o aviso fixo aparecendo. Explique que a localização só é usada com o entregador online, para o cliente acompanhar a entrega.
- **Apple:** na revisão, informe um usuário e uma senha de teste (lojista, entregador ou cliente) nas notas para o revisor.
  Deixe também o botão "excluir minha conta" acessível dentro do app (exigência da Apple).

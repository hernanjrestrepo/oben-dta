/**
 * Traducciones de Oben Xmart. La clave es el texto en español tal como está en la pantalla; lo que falte aquí se
 * muestra en español. Al traducir una pantalla, se envuelven sus textos en `t('…')` y se agregan aquí.
 * Términos de Oben que NO se traducen: OV, PF, OBEN MAS, COMEX, Incoterm, FOB, CIF, HMF, ISF, Inland, Oben Xmart, MIA.
 */
type T = { en: string; pt: string; fr: string };

export const TEXTOS: Record<string, T> = {
  // ── Idioma
  Idioma: { en: 'Language', pt: 'Idioma', fr: 'Langue' },

  // ── Menú: grupos
  Inicio: { en: 'Home', pt: 'Início', fr: 'Accueil' },
  Comercial: { en: 'Sales', pt: 'Comercial', fr: 'Commercial' },
  'Despacho y facturación': { en: 'Shipping & billing', pt: 'Expedição e faturamento', fr: 'Expédition et facturation' },
  Reportes: { en: 'Reports', pt: 'Relatórios', fr: 'Rapports' },
  Aprendizaje: { en: 'Learning', pt: 'Aprendizagem', fr: 'Formation' },
  Configuración: { en: 'Settings', pt: 'Configurações', fr: 'Paramètres' },

  // ── Menú: opciones
  'Centro de Operaciones': { en: 'Operations Center', pt: 'Centro de Operações', fr: 'Centre des opérations' },
  Dashboard: { en: 'Dashboard', pt: 'Painel', fr: 'Tableau de bord' },
  Cotizaciones: { en: 'Quotes', pt: 'Cotações', fr: 'Devis' },
  Órdenes: { en: 'Orders', pt: 'Pedidos', fr: 'Commandes' },
  Clientes: { en: 'Customers', pt: 'Clientes', fr: 'Clients' },
  Equivalencias: { en: 'Equivalences', pt: 'Equivalências', fr: 'Équivalences' },
  'Lista de Empaque': { en: 'Packing List', pt: 'Romaneio', fr: 'Liste de colisage' },
  'Liquidación y Facturación': { en: 'Settlement & Billing', pt: 'Liquidação e Faturamento', fr: 'Liquidation et facturation' },
  'Cuadro de integración': { en: 'Integration table', pt: 'Quadro de integração', fr: "Tableau d'intégration" },
  'Facturas parciales': { en: 'Partial invoices', pt: 'Faturas parciais', fr: 'Factures partielles' },
  Facturas: { en: 'Invoices', pt: 'Faturas', fr: 'Factures' },
  Fletes: { en: 'Freight', pt: 'Fretes', fr: 'Fret' },
  'Reportes Oben': { en: 'Oben reports', pt: 'Relatórios Oben', fr: 'Rapports Oben' },
  'Xmart Academy': { en: 'Xmart Academy', pt: 'Xmart Academy', fr: 'Xmart Academy' },
  'Listas de Distribución': { en: 'Distribution lists', pt: 'Listas de distribuição', fr: 'Listes de diffusion' },
  'Formatos de correo': { en: 'Email templates', pt: 'Modelos de e-mail', fr: "Modèles d'e-mail" },
  Auditoría: { en: 'Audit', pt: 'Auditoria', fr: 'Audit' },
  'Conexión Microsoft 365': { en: 'Microsoft 365 connection', pt: 'Conexão Microsoft 365', fr: 'Connexion Microsoft 365' },
  Usuarios: { en: 'Users', pt: 'Usuários', fr: 'Utilisateurs' },
  Perfiles: { en: 'Profiles', pt: 'Perfis', fr: 'Profils' },

  // ── Menú lateral
  'Digitalización Autónoma': { en: 'Autonomous Digitalization', pt: 'Digitalização Autônoma', fr: 'Digitalisation autonome' },
  'Cambiar contraseña': { en: 'Change password', pt: 'Alterar senha', fr: 'Changer le mot de passe' },
  'Cerrar Sesión': { en: 'Sign out', pt: 'Sair', fr: 'Se déconnecter' },

  // ── Inicio de sesión
  'Digitalización Total Autónoma': { en: 'Total Autonomous Digitalization', pt: 'Digitalização Total Autônoma', fr: 'Digitalisation totale autonome' },
  'Iniciar Sesión': { en: 'Sign in', pt: 'Entrar', fr: 'Se connecter' },
  'Correo electrónico': { en: 'Email', pt: 'E-mail', fr: 'E-mail' },
  Contraseña: { en: 'Password', pt: 'Senha', fr: 'Mot de passe' },
  'El correo electrónico es obligatorio': { en: 'Email is required', pt: 'O e-mail é obrigatório', fr: "L'e-mail est obligatoire" },
  'La contraseña es obligatoria': { en: 'Password is required', pt: 'A senha é obrigatória', fr: 'Le mot de passe est obligatoire' },
  'Iniciando sesión...': { en: 'Signing in...', pt: 'Entrando...', fr: 'Connexion...' },
  Ingresar: { en: 'Sign in', pt: 'Entrar', fr: 'Entrer' },
  'Oben Group — Exportaciones e Industria': { en: 'Oben Group — Exports & Industry', pt: 'Oben Group — Exportações e Indústria', fr: 'Oben Group — Exportations et industrie' },

  // ── Cambiar contraseña
  'Entraste con una contraseña temporal. Para continuar, crea tu propia contraseña.': {
    en: 'You signed in with a temporary password. To continue, create your own password.',
    pt: 'Você entrou com uma senha temporária. Para continuar, crie sua própria senha.',
    fr: 'Vous vous êtes connecté avec un mot de passe temporaire. Pour continuer, créez votre propre mot de passe.',
  },
  'Contraseña actual': { en: 'Current password', pt: 'Senha atual', fr: 'Mot de passe actuel' },
  '(la temporal)': { en: '(the temporary one)', pt: '(a temporária)', fr: '(le temporaire)' },
  'Nueva contraseña (mínimo 8 caracteres)': { en: 'New password (at least 8 characters)', pt: 'Nova senha (mínimo 8 caracteres)', fr: 'Nouveau mot de passe (8 caractères minimum)' },
  'Confirmar nueva contraseña': { en: 'Confirm new password', pt: 'Confirmar nova senha', fr: 'Confirmer le nouveau mot de passe' },
  'Mostrar contraseñas': { en: 'Show passwords', pt: 'Mostrar senhas', fr: 'Afficher les mots de passe' },
  'Ocultar contraseñas': { en: 'Hide passwords', pt: 'Ocultar senhas', fr: 'Masquer les mots de passe' },
  'Guardar contraseña': { en: 'Save password', pt: 'Salvar senha', fr: 'Enregistrer le mot de passe' },
  Cancelar: { en: 'Cancel', pt: 'Cancelar', fr: 'Annuler' },
  'La nueva contraseña debe tener al menos 8 caracteres.': {
    en: 'The new password must have at least 8 characters.',
    pt: 'A nova senha deve ter pelo menos 8 caracteres.',
    fr: 'Le nouveau mot de passe doit comporter au moins 8 caractères.',
  },
  'La confirmación no coincide con la nueva contraseña.': {
    en: 'The confirmation does not match the new password.',
    pt: 'A confirmação não corresponde à nova senha.',
    fr: 'La confirmation ne correspond pas au nouveau mot de passe.',
  },
  'La nueva contraseña debe ser distinta de la actual.': {
    en: 'The new password must be different from the current one.',
    pt: 'A nova senha deve ser diferente da atual.',
    fr: "Le nouveau mot de passe doit être différent de l'actuel.",
  },
  'No se pudo cambiar la contraseña.': { en: 'The password could not be changed.', pt: 'Não foi possível alterar a senha.', fr: "Le mot de passe n'a pas pu être modifié." },

  // ── MIA
  'Hablar con MIA': { en: 'Talk to MIA', pt: 'Falar com a MIA', fr: 'Parler à MIA' },
  'Nueva conversación': { en: 'New conversation', pt: 'Nova conversa', fr: 'Nouvelle conversation' },
  Cerrar: { en: 'Close', pt: 'Fechar', fr: 'Fermer' },
  'Asistente de Oben Xmart': { en: 'Oben Xmart assistant', pt: 'Assistente do Oben Xmart', fr: "Assistante d'Oben Xmart" },
  'Escríbele a MIA...': { en: 'Write to MIA...', pt: 'Escreva para a MIA...', fr: 'Écrivez à MIA...' },
  'Hubo un error conectando con MIA. Intenta de nuevo.': {
    en: 'There was an error connecting to MIA. Please try again.',
    pt: 'Houve um erro ao conectar com a MIA. Tente novamente.',
    fr: 'Une erreur est survenue lors de la connexion à MIA. Veuillez réessayer.',
  },
  '¿Cuándo fue la última factura?': { en: 'When was the last invoice?', pt: 'Quando foi a última fatura?', fr: 'Quand date la dernière facture ?' },
  'Órdenes recientes': { en: 'Recent orders', pt: 'Pedidos recentes', fr: 'Commandes récentes' },
  'Tarifa de Inland a Dallas': { en: 'Inland rate to Dallas', pt: 'Tarifa de Inland para Dallas', fr: 'Tarif Inland vers Dallas' },
  'Hola, soy MIA. Consulto en vivo Oben Xmart y el ERP de Oben: facturas, órdenes, liquidaciones, reportes, fletes, cotizaciones y clientes. También te preparo documentos. Pregúntame, por ejemplo: "¿cuándo fue la última factura?"': {
    en: "Hi, I'm MIA. I check Oben Xmart and Oben's ERP live: invoices, orders, settlements, reports, freight, quotes and customers. I can also prepare documents for you. Ask me, for example: \"when was the last invoice?\"",
    pt: 'Olá, sou a MIA. Consulto em tempo real o Oben Xmart e o ERP da Oben: faturas, pedidos, liquidações, relatórios, fretes, cotações e clientes. Também preparo documentos. Pergunte, por exemplo: "quando foi a última fatura?"',
    fr: 'Bonjour, je suis MIA. Je consulte en direct Oben Xmart et l\'ERP d\'Oben : factures, commandes, liquidations, rapports, fret, devis et clients. Je prépare aussi des documents. Demandez-moi par exemple : « quand date la dernière facture ? »',
  },
};

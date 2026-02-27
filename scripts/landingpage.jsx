<!DOCTYPE html>
<html lang="pt-PT" class="scroll-smooth">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CS2 Analyzer - Domina o Servidor</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/lucide@latest"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;800&display=swap" rel="stylesheet">
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    fontFamily: {
                        sans: ['Inter', 'sans-serif'],
                    },
                    colors: {
                        brand: {
                            500: '#f97316', // Laranja CS
                            600: '#ea580c',
                            900: '#7c2d12',
                        },
                        dark: {
                            900: '#0f172a',
                            800: '#1e293b',
                            700: '#334155',
                        }
                    }
                }
            }
        }
    </script>
    <style>
        /* Custom glow effect for the hero image placeholder */
        .glow-box {
            box-shadow: 0 0 40px -10px rgba(249, 115, 22, 0.4);
        }
    </style>
</head>
<body class="bg-dark-900 text-gray-200 font-sans antialiased selection:bg-brand-500 selection:text-white">

    <!-- Navegação -->
    <nav class="fixed w-full z-50 top-0 transition-all duration-300 backdrop-blur-md bg-dark-900/80 border-b border-dark-800">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex justify-between items-center h-20">
                <div class="flex items-center gap-2 cursor-pointer">
                    <i data-lucide="crosshair" class="text-brand-500 w-8 h-8"></i>
                    <span class="text-2xl font-extrabold tracking-tight text-white">CS2<span class="text-brand-500">Analyzer</span></span>
                </div>
                <div class="hidden md:flex space-x-8">
                    <a href="#funcionalidades" class="text-sm font-medium text-gray-300 hover:text-white transition">Funcionalidades</a>
                    <a href="#como-funciona" class="text-sm font-medium text-gray-300 hover:text-white transition">Como Funciona</a>
                    <a href="#depoimentos" class="text-sm font-medium text-gray-300 hover:text-white transition">Testemunhos</a>
                </div>
                <div class="hidden md:flex">
                    <a href="#" class="inline-flex items-center justify-center px-6 py-2.5 border border-transparent text-sm font-bold rounded-md text-white bg-brand-500 hover:bg-brand-600 shadow-lg shadow-brand-500/30 transition-all gap-2">
                        <i data-lucide="gamepad-2" class="w-4 h-4"></i>
                        Entrar com a Steam
                    </a>
                </div>
                <!-- Menu Mobile (Hamburguer) - Placeholder estético -->
                <div class="md:hidden flex items-center">
                    <button class="text-gray-300 hover:text-white">
                        <i data-lucide="menu" class="w-6 h-6"></i>
                    </button>
                </div>
            </div>
        </div>
    </nav>

    <!-- Hero Section -->
    <section class="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
        <!-- Background Elements -->
        <div class="absolute inset-0 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
            <div class="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 rounded-full bg-brand-900/40 blur-3xl opacity-50"></div>
            <div class="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 rounded-full bg-blue-900/30 blur-3xl opacity-50"></div>
        </div>

        <div class="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <div class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-dark-800 border border-dark-700 text-sm font-medium text-brand-500 mb-8">
                <span class="flex h-2 w-2 relative">
                    <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-500 opacity-75"></span>
                    <span class="relative inline-flex rounded-full h-2 w-2 bg-brand-500"></span>
                </span>
                Agora compatível com Faceit e Premier
            </div>
            
            <h1 class="text-5xl md:text-7xl font-extrabold text-white tracking-tight mb-6">
                Domina o servidor.<br>
                <span class="text-transparent bg-clip-text bg-gradient-to-r from-brand-500 to-orange-300">Sobe de Rank.</span>
            </h1>
            
            <p class="mt-4 max-w-2xl mx-auto text-xl text-gray-400 mb-10">
                A plataforma definitiva de análise de partidas para CS2. Descobre os teus erros, otimiza as tuas utilitárias e alcança o próximo nível de forma automática.
            </p>
            
            <div class="flex flex-col sm:flex-row justify-center gap-4">
                <a href="#" class="inline-flex items-center justify-center px-8 py-4 text-lg font-bold rounded-lg text-white bg-brand-500 hover:bg-brand-600 shadow-lg shadow-brand-500/40 transition-all gap-2 transform hover:-translate-y-1">
                    Começar Gratuitamente
                    <i data-lucide="arrow-right" class="w-5 h-5"></i>
                </a>
                <a href="#demo" class="inline-flex items-center justify-center px-8 py-4 text-lg font-bold rounded-lg text-gray-300 bg-dark-800 border border-dark-700 hover:bg-dark-700 transition-all gap-2">
                    <i data-lucide="play-circle" class="w-5 h-5"></i>
                    Ver Demonstração
                </a>
            </div>

            <!-- Dashboard Mockup -->
            <div class="mt-20 relative mx-auto max-w-5xl">
                <div class="rounded-xl bg-dark-800 border border-dark-700 p-2 glow-box">
                    <div class="rounded-lg bg-dark-900 overflow-hidden border border-dark-700 flex flex-col">
                        <!-- Mac OS style window header -->
                        <div class="h-8 bg-dark-800 border-b border-dark-700 flex items-center px-4 gap-2">
                            <div class="w-3 h-3 rounded-full bg-red-500"></div>
                            <div class="w-3 h-3 rounded-full bg-yellow-500"></div>
                            <div class="w-3 h-3 rounded-full bg-green-500"></div>
                        </div>
                        <!-- Mockup Content -->
                        <div class="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                            <!-- Sidebar Mock -->
                            <div class="hidden md:flex flex-col gap-4 border-r border-dark-700 pr-6">
                                <div class="h-8 bg-dark-800 rounded w-full"></div>
                                <div class="h-8 bg-dark-800 rounded w-3/4"></div>
                                <div class="h-8 bg-dark-800 rounded w-5/6"></div>
                                <div class="h-8 bg-brand-900/30 border border-brand-500/50 rounded w-full mt-4"></div>
                            </div>
                            <!-- Main Stats Mock -->
                            <div class="col-span-2 grid grid-cols-2 gap-4">
                                <div class="col-span-2 h-32 bg-gradient-to-br from-dark-800 to-dark-900 rounded-lg border border-dark-700 p-4 flex flex-col justify-between">
                                    <div class="text-sm text-gray-400">Rating Médio (Últimos 10 jogos)</div>
                                    <div class="text-4xl font-bold text-white flex items-end gap-3">
                                        18,450 <span class="text-brand-500 text-lg flex items-center"><i data-lucide="trending-up" class="w-5 h-5 mr-1"></i>+450</span>
                                    </div>
                                </div>
                                <div class="h-24 bg-dark-800 rounded-lg border border-dark-700 p-4">
                                    <div class="text-sm text-gray-400 mb-2">Eficácia de Flashes</div>
                                    <div class="w-full bg-dark-900 rounded-full h-2.5">
                                      <div class="bg-brand-500 h-2.5 rounded-full" style="width: 75%"></div>
                                    </div>
                                    <div class="text-right text-xs mt-1">75% (Excelente)</div>
                                </div>
                                <div class="h-24 bg-dark-800 rounded-lg border border-dark-700 p-4">
                                    <div class="text-sm text-gray-400 mb-2">Entry Success Rate</div>
                                    <div class="w-full bg-dark-900 rounded-full h-2.5">
                                      <div class="bg-blue-500 h-2.5 rounded-full" style="width: 60%"></div>
                                    </div>
                                    <div class="text-right text-xs mt-1">60% (Acima da Média)</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>

    <!-- Logo Cloud -->
    <section class="border-y border-dark-800 bg-dark-900/50 py-10">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <p class="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-6">Integração perfeita com as tuas plataformas favoritas</p>
            <div class="flex justify-center items-center gap-12 md:gap-24 opacity-60 grayscale hover:grayscale-0 transition-all duration-500">
                <div class="flex items-center gap-2 text-2xl font-bold"><i data-lucide="steam" class="w-8 h-8"></i> Steam</div>
                <div class="text-2xl font-black italic tracking-tighter">FACEIT</div>
                <div class="text-2xl font-bold tracking-widest text-orange-500">GAMERSCLUB</div>
            </div>
        </div>
    </section>

    <!-- Funcionalidades -->
    <section id="funcionalidades" class="py-24 relative">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="text-center max-w-3xl mx-auto mb-16">
                <h2 class="text-brand-500 font-semibold tracking-wide uppercase">O teu treinador pessoal</h2>
                <p class="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-white sm:text-4xl">
                    Vai muito além do K/D Ratio
                </p>
                <p class="mt-4 max-w-2xl text-xl text-gray-400 mx-auto">
                    A nossa IA analisa as tuas demos (GOTV) jogada a jogada para te entregar métricas que as tabelas de pontuação do jogo escondem.
                </p>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
                <!-- Feature 1 -->
                <div class="bg-dark-800 rounded-2xl p-8 border border-dark-700 hover:border-brand-500/50 transition-colors group">
                    <div class="w-14 h-14 bg-dark-900 rounded-xl flex items-center justify-center mb-6 group-hover:bg-brand-500/20 transition-colors">
                        <i data-lucide="bar-chart-2" class="w-7 h-7 text-brand-500"></i>
                    </div>
                    <h3 class="text-xl font-bold text-white mb-3">Métricas Avançadas</h3>
                    <p class="text-gray-400 leading-relaxed">
                        Analisa o teu ADR (Dano Médio por Ronda), KAST, taxa de sucesso nos entry frags e o teu impacto real na vitória da tua equipa.
                    </p>
                </div>

                <!-- Feature 2 -->
                <div class="bg-dark-800 rounded-2xl p-8 border border-dark-700 hover:border-brand-500/50 transition-colors group">
                    <div class="w-14 h-14 bg-dark-900 rounded-xl flex items-center justify-center mb-6 group-hover:bg-brand-500/20 transition-colors">
                        <i data-lucide="bomb" class="w-7 h-7 text-brand-500"></i>
                    </div>
                    <h3 class="text-xl font-bold text-white mb-3">Eficácia de Utilitárias</h3>
                    <p class="text-gray-400 leading-relaxed">
                        Descobre quantos inimigos cegaste, quanto tempo a tua smoke bloqueou a visão e o dano exato causado pelas tuas HEs e Molotovs.
                    </p>
                </div>

                <!-- Feature 3 -->
                <div class="bg-dark-800 rounded-2xl p-8 border border-dark-700 hover:border-brand-500/50 transition-colors group">
                    <div class="w-14 h-14 bg-dark-900 rounded-xl flex items-center justify-center mb-6 group-hover:bg-brand-500/20 transition-colors">
                        <i data-lucide="map" class="w-7 h-7 text-brand-500"></i>
                    </div>
                    <h3 class="text-xl font-bold text-white mb-3">Mapas de Calor (Heatmaps)</h3>
                    <p class="text-gray-400 leading-relaxed">
                        Visualiza de onde dás mais dano e onde costumas morrer frequentemente na Mirage, Inferno, Vertigo e em toda a rotação ativa.
                    </p>
                </div>
            </div>
        </div>
    </section>

    <!-- Como Funciona -->
    <section id="como-funciona" class="py-24 bg-dark-800/50 border-y border-dark-700">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="text-center mb-16">
                <h2 class="text-3xl font-extrabold text-white sm:text-4xl">Três passos para a Global Elite</h2>
            </div>

            <div class="relative">
                <!-- Linha conectora (Desktop) -->
                <div class="hidden md:block absolute top-12 left-[10%] right-[10%] h-0.5 bg-gradient-to-r from-dark-800 via-brand-500/50 to-dark-800"></div>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-12 relative z-10">
                    <div class="flex flex-col items-center text-center">
                        <div class="w-24 h-24 rounded-full bg-dark-900 border-4 border-dark-700 flex items-center justify-center mb-6 shadow-xl">
                            <span class="text-3xl font-black text-white">1</span>
                        </div>
                        <h3 class="text-xl font-bold text-white mb-2">Conecta a tua conta</h3>
                        <p class="text-gray-400">Faz login com a Steam. Nós sincronizamos automaticamente o teu histórico de partidas e demos.</p>
                    </div>

                    <div class="flex flex-col items-center text-center">
                        <div class="w-24 h-24 rounded-full bg-dark-900 border-4 border-brand-500 flex items-center justify-center mb-6 shadow-[0_0_30px_-5px_rgba(249,115,22,0.5)]">
                            <span class="text-3xl font-black text-brand-500">2</span>
                        </div>
                        <h3 class="text-xl font-bold text-white mb-2">Vai a jogo</h3>
                        <p class="text-gray-400">Continua a jogar as tuas partidas no Premier ou Faceit como habitualmente. Sem precisares de abrir nada extra.</p>
                    </div>

                    <div class="flex flex-col items-center text-center">
                        <div class="w-24 h-24 rounded-full bg-dark-900 border-4 border-dark-700 flex items-center justify-center mb-6 shadow-xl">
                            <span class="text-3xl font-black text-white">3</span>
                        </div>
                        <h3 class="text-xl font-bold text-white mb-2">Analisa e Evolui</h3>
                        <p class="text-gray-400">Acede ao teu painel no dia seguinte para veres relatórios detalhados sobre o que precisas de treinar.</p>
                    </div>
                </div>
            </div>
        </div>
    </section>

    <!-- Testemunhos -->
    <section id="depoimentos" class="py-24">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 class="text-center text-3xl font-extrabold text-white mb-16">Jogadores que já subiram de rank</h2>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                <!-- Testemunho 1 -->
                <div class="bg-dark-800 p-8 rounded-2xl border border-dark-700 relative">
                    <i data-lucide="quote" class="absolute top-8 right-8 w-12 h-12 text-dark-700 opacity-50"></i>
                    <p class="text-lg text-gray-300 mb-6 italic">
                        "Estava preso nos 12k de rating há meses. A aplicação mostrou-me que o meu posicionamento a defender o bombsite B era demasiado previsível e as minhas flashes não cegavam ninguém. Mudei a minha abordagem e cheguei aos 18k num mês."
                    </p>
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 bg-dark-700 rounded-full flex items-center justify-center overflow-hidden">
                            <!-- Placeholder avatar -->
                            <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Fallen&backgroundColor=f97316" alt="Avatar" class="w-full h-full object-cover">
                        </div>
                        <div>
                            <div class="text-white font-bold">João "TugaSniper" Silva</div>
                            <div class="text-brand-500 text-sm">Rating Premier: 18,500</div>
                        </div>
                    </div>
                </div>

                <!-- Testemunho 2 -->
                <div class="bg-dark-800 p-8 rounded-2xl border border-dark-700 relative">
                    <i data-lucide="quote" class="absolute top-8 right-8 w-12 h-12 text-dark-700 opacity-50"></i>
                    <p class="text-lg text-gray-300 mb-6 italic">
                        "Sempre achei que o meu problema era a mira. Os heatmaps mostraram-me que eu morria 70% das vezes de costas ou por mau posicionamento no mid da Mirage. Parei de dar a cara à toa e o meu K/D subiu drasticamente."
                    </p>
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 bg-dark-700 rounded-full flex items-center justify-center overflow-hidden">
                            <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Fer&backgroundColor=334155" alt="Avatar" class="w-full h-full object-cover">
                        </div>
                        <div>
                            <div class="text-white font-bold">Miguel "AimGod" Costa</div>
                            <div class="text-blue-400 text-sm">Faceit Lvl 8</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>

    <!-- CTA Section -->
    <section class="py-20 relative overflow-hidden">
        <div class="absolute inset-0 bg-brand-600"></div>
        <!-- Pattern Overlay -->
        <div class="absolute inset-0 opacity-10" style="background-image: radial-gradient(#000 2px, transparent 2px); background-size: 30px 30px;"></div>
        
        <div class="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center z-10">
            <h2 class="text-3xl md:text-5xl font-extrabold text-white mb-6">
                Pronto para deixar de ser carregado?
            </h2>
            <p class="text-xl text-brand-100 mb-10">
                Junta-te a milhares de jogadores que estão a usar dados para esmagar os adversários.
            </p>
            <a href="#" class="inline-flex items-center justify-center px-8 py-4 text-xl font-bold rounded-lg text-brand-600 bg-white hover:bg-gray-100 shadow-2xl transition-all transform hover:scale-105">
                Criar Conta Gratuita
            </a>
            <p class="mt-4 text-sm text-brand-200">Não é necessário cartão de crédito. Análise gratuita das últimas 5 partidas.</p>
        </div>
    </section>

    <!-- Footer -->
    <footer class="bg-dark-950 border-t border-dark-800 py-12">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="grid grid-cols-1 md:grid-cols-4 gap-8">
                <div class="col-span-1 md:col-span-2">
                    <div class="flex items-center gap-2 mb-4">
                        <i data-lucide="crosshair" class="text-brand-500 w-6 h-6"></i>
                        <span class="text-xl font-extrabold text-white">CS2<span class="text-brand-500">Analyzer</span></span>
                    </div>
                    <p class="text-gray-400 text-sm max-w-sm">
                        A ferramenta de análise de estatísticas desenhada para jogadores sérios de Counter-Strike 2 que pretendem alcançar a Global Elite e Nível 10 da Faceit.
                    </p>
                </div>
                
                <div>
                    <h4 class="text-white font-bold mb-4 uppercase text-sm tracking-wider">Produto</h4>
                    <ul class="space-y-2">
                        <li><a href="#" class="text-gray-400 hover:text-brand-500 text-sm transition">Funcionalidades</a></li>
                        <li><a href="#" class="text-gray-400 hover:text-brand-500 text-sm transition">Preços</a></li>
                        <li><a href="#" class="text-gray-400 hover:text-brand-500 text-sm transition">Changelog</a></li>
                    </ul>
                </div>

                <div>
                    <h4 class="text-white font-bold mb-4 uppercase text-sm tracking-wider">Legal</h4>
                    <ul class="space-y-2">
                        <li><a href="#" class="text-gray-400 hover:text-white text-sm transition">Termos de Serviço</a></li>
                        <li><a href="#" class="text-gray-400 hover:text-white text-sm transition">Política de Privacidade</a></li>
                        <li><a href="#" class="text-gray-400 hover:text-white text-sm transition">Contacto</a></li>
                    </ul>
                </div>
            </div>
            
            <div class="mt-12 pt-8 border-t border-dark-800 flex flex-col md:flex-row justify-between items-center gap-4">
                <p class="text-gray-500 text-sm">
                    © 2024 CS2 Analyzer. Todos os direitos reservados. Não afiliado à Valve Corp.
                </p>
                <div class="flex gap-4">
                    <a href="#" class="text-gray-500 hover:text-white transition"><i data-lucide="twitter" class="w-5 h-5"></i></a>
                    <a href="#" class="text-gray-500 hover:text-white transition"><i data-lucide="github" class="w-5 h-5"></i></a>
                    <a href="#" class="text-gray-500 hover:text-white transition"><i data-lucide="youtube" class="w-5 h-5"></i></a>
                </div>
            </div>
        </div>
    </footer>

    <!-- Initialize Icons -->
    <script>
        lucide.createIcons();
    </script>
</body>
</html>
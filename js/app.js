import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, onSnapshot, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBcrhhlr6sPRy1wfhCBwyAucnTleQDWPUI",
    authDomain: "petlojas-saas.firebaseapp.com",
    projectId: "petlojas-saas",
    storageBucket: "petlojas-saas.firebasestorage.app",
    messagingSenderId: "699445164987",
    appId: "1:699445164987:web:908f92216c5fee00aea29e"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

setPersistence(auth, browserLocalPersistence).catch(console.error);

window.currentStoreId = null;
window.appItems = [];
window.appGroups = [];
window.appSettings = { storeName: "Loja", whatsapp: "" };
window.cart = [];

let currentView = 'home';
let currentCatalogType = 'product'; 
let currentSearchQuery = '';
let currentHistory = ['home'];

window.forceUpdate = async () => {
    try {
        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (let registration of registrations) await registration.unregister();
        }
        if ('caches' in window) {
            const cacheNames = await caches.keys();
            await Promise.all(cacheNames.map(cache => caches.delete(cache)));
        }
    } catch(e) { console.error("Erro ao limpar caches:", e); }
    setTimeout(() => { window.location.reload(true); }, 500);
};

async function resolveTenant() {
    const urlParams = new URLSearchParams(window.location.search);
    const host = window.location.hostname;
    if (urlParams.has('loja')) return urlParams.get('loja');
    if (host !== 'localhost' && host !== '127.0.0.1' && host !== 'petlojas-saas.vercel.app') {
        try {
            const domainDoc = await getDoc(doc(db, 'domain_mapping', host.replace(/\./g, '_')));
            if (domainDoc.exists()) return domainDoc.data().storeId;
        } catch(e) {}
    }
    return null;
}

window.onload = async () => {
    if (window.lucide) window.lucide.createIcons();
    window.currentStoreId = await resolveTenant();
    try { await signInAnonymously(auth); } catch(e) {}

    if (!window.currentStoreId) {
        // --- MODO MARKETPLACE CENTRAL ---
        document.getElementById('page-title').innerText = "PetLojas - Marketplace Central";
        document.getElementById('marketplace-root').classList.remove('hidden');
        
        onSnapshot(doc(db, 'system', 'marketplace'), (docSnap) => {
            if(docSnap.exists()) {
                const data = docSnap.data();
                if(data.cityName) document.getElementById('mkt-city-name').innerText = data.cityName;
                if(data.logoUrl) {
                    document.getElementById('mkt-logo-container').innerHTML = `<img src="${window.getDriveImageUrl(data.logoUrl)}" class="w-full h-full object-cover">`;
                    document.getElementById('mkt-logo-container').classList.remove('bg-teal-600');
                    document.getElementById('dynamic-favicon').href = data.logoUrl;
                    document.getElementById('dynamic-apple-icon').href = data.logoUrl;
                }
            }
        });

        let deferredPrompt;
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            const installBtn = document.getElementById('mkt-install-btn');
            if(installBtn) installBtn.classList.remove('hidden');
        });

        window.installMarketplaceApp = async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                if (outcome === 'accepted') document.getElementById('mkt-install-btn').classList.add('hidden');
                deferredPrompt = null;
            } else {
                alert("O seu navegador não suporta instalação direta ou o App já está instalado.");
            }
        };
        
        onSnapshot(collection(db, 'stores'), (snapshot) => {
            const grid = document.getElementById('marketplace-stores-grid');
            let html = '';
            snapshot.forEach(storeDoc => {
                const id = storeDoc.id;
                const link = `https://petlojas-saas.vercel.app/?loja=${id}`;
                html += `
                <div class="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 bg-teal-600/10 text-teal-700 font-black flex items-center justify-center rounded-xl border border-teal-100 uppercase">${id.substring(0,2)}</div>
                        <div>
                            <h3 class="font-black text-gray-800 text-lg uppercase tracking-wide">${id.replace(/_/g, ' ')}</h3>
                            <p class="text-xs text-slate-400">Parceiro Oficial</p>
                        </div>
                    </div>
                    <div class="mt-6 pt-4 border-t border-gray-50 flex gap-2">
                        <a href="${link}" target="_blank" class="flex-1 bg-teal-700 hover:bg-teal-600 text-white text-center font-black py-3 rounded-xl text-xs flex items-center justify-center gap-2 transition-colors">Aceder à Loja <i data-lucide="external-link" class="w-4 h-4"></i></a>
                    </div>
                </div>`;
            });
            if (grid) grid.innerHTML = html || '<p class="text-gray-400 text-sm">Nenhum parceiro ativo.</p>';
            if (window.lucide) window.lucide.createIcons();
            
            document.getElementById('loader').classList.add('opacity-0');
            setTimeout(() => document.getElementById('loader').classList.add('hidden'), 500);
        });

    } else {
        // --- MODO WHITELABEL LOJA ---
        document.getElementById('store-root').classList.remove('hidden');
        document.getElementById('loader-text').innerText = "A iniciar loja...";

        onSnapshot(doc(db, 'stores', window.currentStoreId, 'settings', 'general'), (docSnap) => {
            if(docSnap.exists()) {
                const data = docSnap.data();
                window.appSettings = { ...window.appSettings, ...data };
                document.getElementById('header-store-name').innerText = data.storeName || "PetLojas";
                document.getElementById('page-title').innerText = data.storeName || "Loja";
                
                if(data.primaryColor) {
                    document.documentElement.style.setProperty('--cor-primaria', data.primaryColor);
                    document.getElementById('dynamic-theme-color').setAttribute("content", data.primaryColor);
                }

                if(data.logoUrl) {
                    document.getElementById('header-logo').src = data.logoUrl;
                    const splash = document.getElementById('splash-logo');
                    splash.src = data.logoUrl;
                    splash.classList.remove('hidden');
                    document.getElementById('dynamic-favicon').href = data.logoUrl;
                    document.getElementById('dynamic-apple-icon').href = data.logoUrl;
                }
            }
            document.getElementById('loader').classList.add('opacity-0');
            setTimeout(() => document.getElementById('loader').classList.add('hidden'), 500);
        });

        onSnapshot(collection(db, 'stores', window.currentStoreId, 'items'), (snapshot) => {
            window.appItems = []; 
            snapshot.forEach(doc => {
                let d = doc.data();
                if(d.description === 'undefined') d.description = '';
                if(Array.isArray(d.tags)) d.tags = d.tags.filter(t => t && t !== 'undefined'); else d.tags = [];
                window.appItems.push({ id: doc.id, ...d });
            });
            window.appItems.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            if(currentView === 'home') window.renderFeed();
            if(currentView === 'catalog') window.renderCatalog();
        });

        onSnapshot(collection(db, 'stores', window.currentStoreId, 'groups'), (snapshot) => {
            window.appGroups = []; 
            snapshot.forEach(doc => window.appGroups.push({ id: doc.id, ...doc.data() }));
            if(currentView === 'alerts') window.renderAlerts();
        });
    }
};

window.getDriveImageUrl = (url) => { 
    if (!url) return ""; 
    const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/); 
    return match ? `https://drive.google.com/uc?export=view&id=${match[1]}` : url; 
};
window.getYoutubeId = (url) => { 
    if (!url) return null;
    const match = url.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/); 
    return (match && match[2].length === 11) ? match[2] : null; 
};
window.parseCurrency = (str) => { if(!str) return 0; return parseFloat(String(str).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')); };
window.formatCurrency = (num) => num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

window.showView = (view, type = null) => {
    ['home-view', 'catalog-view', 'detail-view', 'alerts-view', 'cart-view'].forEach(id => document.getElementById(id).classList.add('hidden'));
    if(view !== 'detail' && view !== 'cart') { document.getElementById('searchInput').value = ''; currentSearchQuery = ''; }

    if (view === 'home') { document.getElementById('home-view').classList.remove('hidden'); window.renderFeed(); currentHistory = ['home']; } 
    else if (view === 'catalog') {
        currentCatalogType = type;
        document.getElementById('catalog-view').classList.remove('hidden'); window.renderCatalog(); currentHistory = ['catalog', type];
    }
    else if (view === 'alerts') { document.getElementById('alerts-view').classList.remove('hidden'); window.renderAlerts(); currentHistory = ['alerts']; }
    else if (view === 'cart') { document.getElementById('cart-view').classList.remove('hidden'); window.updateCartUI(); currentHistory = ['cart']; }
    
    updateActiveNav(view, type); window.scrollTo(0, 0); 
    if (window.lucide) window.lucide.createIcons();
};

window.goBack = () => { if(currentHistory[0] === 'catalog') window.showView('catalog', currentHistory[1]); else window.showView('home'); };

function updateActiveNav(view, type) {
    document.querySelectorAll('.nav-btn').forEach(btn => { btn.classList.remove('text-primaria'); btn.classList.add('text-gray-400'); });
    let active = document.getElementById('nav-' + (type || view));
    if(active) { active.classList.remove('text-gray-400'); active.classList.add('text-primaria'); }
}

window.handleSearch = (e) => {
    currentSearchQuery = e.target.value.toLowerCase();
    if(currentSearchQuery.length > 0 && currentView !== 'catalog') window.showView('catalog', 'product'); else window.renderCatalog();
};

window.filterByTag = (tag) => { document.getElementById('searchInput').value = tag; currentSearchQuery = tag.toLowerCase(); window.renderCatalog(); };

const buildCarouselHtml = (item, idPrefix) => {
    const ytId = window.getYoutubeId(item.youtubeUrl);
    const images = item.images && item.images.length > 0 ? item.images : (item.image ? [item.image] : []);
    
    if (ytId) {
        return `<div class="aspect-[9/16] bg-black relative overflow-hidden group"><iframe class="absolute inset-0 w-full h-full" src="https://www.youtube.com/embed/${ytId}?autoplay=1&mute=1" frameborder="0"></iframe></div>`;
    } else if (images.length > 1) {
        const carouselId = `${idPrefix}-carousel-${item.id}`;
        const slides = images.map(img => `<img src="${window.getDriveImageUrl(img)}" class="w-full h-full object-cover flex-shrink-0 snap-center">`).join('');
        return `
        <div class="aspect-square bg-gray-100 relative overflow-hidden group">
            <div id="${carouselId}" class="flex w-full h-full overflow-x-auto snap-x snap-mandatory no-scrollbar scroll-smooth" onscroll="window.updateCarouselDots('${carouselId}')">${slides}</div>
            <button onclick="event.stopPropagation(); window.scrollCarousel('${carouselId}', -1)" class="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/80 text-gray-800 rounded-full flex items-center justify-center shadow-md backdrop-blur-sm z-20"><i data-lucide="chevron-left"></i></button>
            <button onclick="event.stopPropagation(); window.scrollCarousel('${carouselId}', 1)" class="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/80 text-gray-800 rounded-full flex items-center justify-center shadow-md backdrop-blur-sm z-20"><i data-lucide="chevron-right"></i></button>
            <div class="absolute top-2 left-2 bg-black/50 text-white text-[10px] font-bold px-2 py-1 rounded-md z-10 flex items-center gap-1"><i data-lucide="images" class="w-3 h-3"></i> ${images.length}</div>
            <div id="dots-${carouselId}" class="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-1.5 z-40">
                ${images.map((_, i) => `<div class="w-2 h-2 rounded-full border border-black/20 transition-colors duration-300 ${i === 0 ? 'bg-white' : 'bg-white/50'}"></div>`).join('')}
            </div>
        </div>`;
    } else {
        return `<div class="aspect-square bg-gray-100 relative overflow-hidden"><img src="${window.getDriveImageUrl(images[0]) || 'https://placehold.co/600x600?text=Sem+Foto'}" class="w-full h-full object-cover"></div>`;
    }
};

window.renderFeed = () => {
    const container = document.getElementById('feed-container');
    const items = window.appItems.filter(i => i.vitrine);
    if(items.length === 0) { container.innerHTML = `<p class="text-center py-10 text-gray-400">Nenhum destaque.</p>`; return; }
    container.innerHTML = items.map(item => `
        <div onclick="window.openDetail('${item.id}')" class="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden cursor-pointer group">
            ${buildCarouselHtml(item, 'feed')}
            <div class="p-5">
                <h3 class="text-xl font-black text-gray-800 mb-1 leading-tight">${item.title}</h3>
                <p class="text-2xl font-black text-primaria">${item.price}</p>
                <button class="mt-4 w-full bg-gray-50 text-primaria font-bold py-3 rounded-xl">Ver Detalhes</button>
            </div>
        </div>`).join('');
    if (window.lucide) window.lucide.createIcons();
};

window.renderCatalog = () => {
    const container = document.getElementById('catalog-container');
    const filtered = window.appItems.filter(i => i.type === currentCatalogType && (!currentSearchQuery || i.title.toLowerCase().includes(currentSearchQuery)));
    container.innerHTML = filtered.map(item => `
        <div onclick="window.openDetail('${item.id}')" class="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 flex flex-col h-full cursor-pointer">
            <img src="${window.getDriveImageUrl(item.image)}" class="aspect-square object-cover rounded-xl mb-2">
            <h3 class="text-sm font-bold text-gray-800 line-clamp-2 leading-tight">${item.title}</h3>
            <p class="text-primaria font-black mt-auto pt-2">${item.price}</p>
        </div>`).join('') || '<p class="col-span-full text-center py-10 text-gray-400">Nenhum item localizado.</p>';
};

window.openDetail = (id) => {
    window.currentDetailId = id;
    const item = window.appItems.find(x => x.id === id); if(!item) return;
    window.showView('detail');
    document.getElementById('detail-container').innerHTML = `
        <div class="relative">${buildCarouselHtml(item, 'detail')}</div>
        <div class="p-6">
            <h1 class="text-2xl font-black text-gray-800 mb-2">${item.title}</h1>
            <p class="text-3xl font-black text-primaria mb-6">${item.price}</p>
            <p class="text-gray-600 mb-8 whitespace-pre-wrap">${item.description || ''}</p>
            <button onclick="window.addToCart('${item.id}')" class="w-full bg-primaria text-white py-4 rounded-2xl font-black uppercase shadow-md">Adicionar</button>
        </div>`;
    if (window.lucide) window.lucide.createIcons();
};

window.renderAlerts = () => {
    document.getElementById('groups-container').innerHTML = window.appGroups.map(g => `
        <a href="${g.link}" target="_blank" class="flex items-center justify-between bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full bg-green-100 text-green-600 flex items-center justify-center"><i data-lucide="message-circle"></i></div>
                <p class="font-bold text-gray-800">${g.name}</p>
            </div>
            <button class="bg-[#25D366] text-white px-4 py-2 rounded-lg text-sm font-bold">Entrar</button>
        </a>`).join('') || '<p class="text-center text-gray-400">Nenhum aviso ativo.</p>';
    if (window.lucide) window.lucide.createIcons();
};

window.addToCart = (id) => {
    const item = window.appItems.find(x => x.id === id); if(!item) return;
    const existing = window.cart.find(x => x.id === id);
    if(existing) existing.quantity += 1; else window.cart.push({ ...item, quantity: 1 });
    window.updateCartUI();
    window.showSystemMessage("Adicionado!", `${item.title} no carrinho.`, "success");
};

window.updateCartUI = () => {
    const badge = document.getElementById('cart-badge');
    const totalItems = window.cart.reduce((sum, i) => sum + i.quantity, 0);
    if(totalItems > 0) { badge.innerText = totalItems; badge.classList.remove('hidden'); } else badge.classList.add('hidden');

    const container = document.getElementById('cart-items-container');
    if(window.cart.length === 0) { container.innerHTML = ''; document.getElementById('cart-summary').classList.add('hidden'); document.getElementById('cart-empty').classList.remove('hidden'); return; }

    document.getElementById('cart-empty').classList.add('hidden'); document.getElementById('cart-summary').classList.remove('hidden');
    let total = 0;
    container.innerHTML = window.cart.map(item => {
        total += window.parseCurrency(item.price) * item.quantity;
        return `
        <div class="flex items-center gap-3 bg-white p-3 rounded-2xl border border-gray-100 shadow-sm">
            <img src="${window.getDriveImageUrl(item.image)}" class="w-16 h-16 object-cover rounded-xl">
            <div class="flex-1 min-w-0">
                <p class="text-sm font-bold text-gray-800 truncate">${item.title}</p>
                <p class="text-primaria font-black text-sm">${item.price}</p>
            </div>
            <div class="flex items-center gap-2 bg-gray-50 rounded-lg p-1 border border-gray-200">
                <button onclick="window.changeQty('${item.id}', -1)" class="w-6 h-6"><i data-lucide="minus" class="w-3 h-3 mx-auto"></i></button>
                <span class="text-xs font-black w-4 text-center">${item.quantity}</span>
                <button onclick="window.changeQty('${item.id}', 1)" class="w-6 h-6"><i data-lucide="plus" class="w-3 h-3 mx-auto"></i></button>
            </div>
        </div>`;
    }).join('');
    document.getElementById('cart-total').innerText = window.formatCurrency(total);
    if (window.lucide) window.lucide.createIcons();
};

window.changeQty = (id, d) => { const i = window.cart.find(x => x.id === id); if(i) { i.quantity += d; if(i.quantity <= 0) window.cart = window.cart.filter(x => x.id !== id); window.updateCartUI(); } };

window.checkoutWhatsApp = () => {
    let text = "Olá! Pedido:%0A%0A";
    window.cart.forEach(i => text += `🐾 ${i.quantity}x ${i.title}%0A`);
    text += `%0A*Total: ${document.getElementById('cart-total').innerText}*%0AComo procedo?`;
    window.open(`https://wa.me/${window.appSettings.whatsapp.replace(/\D/g, '')}?text=${text}`, '_blank');
};

window.showSystemMessage = (title, text, type) => {
    const m = document.getElementById('msg-modal');
    document.getElementById('msg-title').innerText = title;
    document.getElementById('msg-text').innerText = text;
    const icon = document.getElementById('msg-icon');
    icon.className = `mx-auto w-12 h-12 rounded-full mb-4 flex items-center justify-center ${type==='success'?'bg-green-100 text-green-600':'bg-blue-100 text-blue-600'}`;
    icon.innerHTML = `<i data-lucide="${type==='success'?'check':'info'}"></i>`;
    document.getElementById('msg-buttons').innerHTML = `<button onclick="window.closeSystemMessage()" class="w-full bg-slate-800 text-white py-3 rounded-xl font-bold">Entendido</button>`;
    m.classList.remove('hidden'); setTimeout(() => m.classList.remove('opacity-0'), 10); 
    if (window.lucide) window.lucide.createIcons();
};

window.closeSystemMessage = () => { document.getElementById('msg-modal').classList.add('opacity-0'); setTimeout(() => document.getElementById('msg-modal').classList.add('hidden'), 300); };
window.scrollCarousel = (id, dir) => { const c = document.getElementById(id); if (c) c.scrollBy({ left: dir * c.clientWidth, behavior: 'smooth' }); };
window.updateCarouselDots = (id) => {
    const c = document.getElementById(id); const dots = document.getElementById(`dots-${id}`); if (!c || !dots) return;
    const idx = Math.round(c.scrollLeft / c.clientWidth);
    Array.from(dots.children).forEach((dot, i) => dot.className = i === idx ? 'w-2 h-2 rounded-full bg-white' : 'w-2 h-2 rounded-full bg-white/50');
};
window.shareApp = () => { window.open(`https://wa.me/?text=Visite a nossa loja: ${window.location.href}`, '_blank'); };
window.openLocation = () => { if(window.appSettings.mapsUrl) window.open(window.appSettings.mapsUrl, '_blank'); };

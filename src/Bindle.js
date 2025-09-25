import { WearableManager } from './WearableManager.js';

export class Bindle {
    constructor(networkManager) {
        this.networkManager = networkManager;
        this.isOpen = false;
        this.inventory = new Array(8 * 10).fill(null); // 8x10 grid like Diablo II
        this.equipment = {
            head: null,
            face: null,
            eyes: null,
            ear: null,
            neck: null,
            torso: null,
            back: null,
            hands: null,
            finger: null,
            legs: null,
            feet: null,
            leftHand: null,
            rightHand: null,
            accessory1: null,
            accessory2: null
        };
        
        // Wearable system
        this.wearableManager = null;
        this.loadedWearables = new Map(); // Cache for loaded 3D models
        this.draggedItem = null;
        this.draggedFromSlot = null;
        
        this.init();
    }
    
    init() {
        this.createBindleUI();
        this.setupEventListeners();
        this.generateStartingItems();
        this.initWearableSystem();
    }
    
    initWearableSystem() {
        // Initialize wearable manager - will be properly set up when scene and avatar manager are available
        this.wearableManager = null;
    }
    
    setWearableManager(wearableManager) {
        this.wearableManager = wearableManager;
    }
    
    createBindleUI() {
        // Main bindle container
        const bindleContainer = document.createElement('div');
        bindleContainer.id = 'bindle-container';
        bindleContainer.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) scale(0);
            width: 600px;
            height: 500px;
            background: rgba(0, 0, 0, 0.2);
            border: 2px solid rgba(139, 69, 19, 0.8);
            border-radius: 12px;
            backdrop-filter: blur(25px);
            box-shadow: 0 0 50px rgba(139, 69, 19, 0.3);
            display: flex;
            flex-direction: column;
            z-index: 1000;
            transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            opacity: 0;
        `;
        
        // Bindle header
        const bindleHeader = document.createElement('div');
        bindleHeader.style.cssText = `
            padding: 16px 20px;
            border-bottom: 1px solid rgba(139, 69, 19, 0.5);
            color: #D2691E;
            font-size: 18px;
            font-weight: bold;
            text-align: center;
            text-shadow: 0 0 10px rgba(210, 105, 30, 0.5);
            background: linear-gradient(90deg, rgba(139, 69, 19, 0.3), rgba(210, 105, 30, 0.2));
        `;
        bindleHeader.innerHTML = `
            🎒 BINDLE INVENTORY
            <button id="bindle-close" style="float: right; background: none; border: none; color: #ff6666; cursor: pointer; font-size: 20px;">×</button>
        `;
        
        // Main content area
        const bindleContent = document.createElement('div');
        bindleContent.style.cssText = `
            flex: 1;
            display: flex;
            padding: 16px;
            gap: 16px;
        `;
        
        // Equipment panel (left side)
        const equipmentPanel = this.createEquipmentPanel();
        
        // Inventory grid (right side)
        const inventoryPanel = this.createInventoryPanel();
        
        bindleContent.appendChild(equipmentPanel);
        bindleContent.appendChild(inventoryPanel);
        
        bindleContainer.appendChild(bindleHeader);
        bindleContainer.appendChild(bindleContent);
        
        document.body.appendChild(bindleContainer);
        
        // Bindle toggle button
        const bindleToggle = document.createElement('button');
        bindleToggle.id = 'bindle-toggle';
        bindleToggle.textContent = '🎒';
        bindleToggle.style.cssText = `
            position: fixed;
            bottom: 90px;
            right: 20px;
            width: 50px;
            height: 50px;
            background: rgba(139, 69, 19, 0.3);
            border: 1px solid rgba(139, 69, 19, 0.5);
            border-radius: 50%;
            color: #D2691E;
            font-size: 20px;
            cursor: pointer;
            z-index: 202;
            transition: all 0.3s ease;
            backdrop-filter: blur(10px);
            box-shadow: 0 4px 16px rgba(139, 69, 19, 0.2);
        `;
        
        document.body.appendChild(bindleToggle);
    }
    
    createEquipmentPanel() {
        const panel = document.createElement('div');
        panel.style.cssText = `
            width: 200px;
            background: rgba(139, 69, 19, 0.1);
            border: 1px solid rgba(139, 69, 19, 0.3);
            border-radius: 8px;
            padding: 12px;
        `;
        
        const title = document.createElement('div');
        title.textContent = 'EQUIPMENT';
        title.style.cssText = `
            color: #D2691E;
            font-size: 14px;
            font-weight: bold;
            text-align: center;
            margin-bottom: 12px;
            text-shadow: 0 0 5px rgba(210, 105, 30, 0.5);
        `;
        panel.appendChild(title);
        
        // Equipment slots
        const equipmentSlots = [
            { id: 'head', name: '👑 Head', icon: '🧢' },
            { id: 'chest', name: '👕 Chest', icon: '🎽' },
            { id: 'legs', name: '👖 Legs', icon: '🩳' },
            { id: 'feet', name: '👟 Feet', icon: '👠' },
            { id: 'leftHand', name: '🤚 Left Hand', icon: '🧤' },
            { id: 'rightHand', name: '🤜 Right Hand', icon: '⚔️' },
            { id: 'accessory1', name: '💍 Ring 1', icon: '💎' },
            { id: 'accessory2', name: '💍 Ring 2', icon: '✨' }
        ];
        
        equipmentSlots.forEach(slot => {
            const slotDiv = document.createElement('div');
            slotDiv.className = 'equipment-slot';
            slotDiv.dataset.slotType = slot.id;
            slotDiv.style.cssText = `
                width: 100%;
                height: 40px;
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid rgba(139, 69, 19, 0.4);
                border-radius: 6px;
                margin-bottom: 6px;
                display: flex;
                align-items: center;
                padding: 8px;
                cursor: pointer;
                transition: all 0.2s ease;
                color: #ccc;
                font-size: 12px;
            `;
            slotDiv.innerHTML = `<span style="margin-right: 8px;">${slot.icon}</span>${slot.name}`;
            
            panel.appendChild(slotDiv);
        });
        
        return panel;
    }
    
    createInventoryPanel() {
        const panel = document.createElement('div');
        panel.style.cssText = `
            flex: 1;
            background: rgba(139, 69, 19, 0.1);
            border: 1px solid rgba(139, 69, 19, 0.3);
            border-radius: 8px;
            padding: 12px;
        `;
        
        const title = document.createElement('div');
        title.textContent = 'BINDLE STORAGE';
        title.style.cssText = `
            color: #D2691E;
            font-size: 14px;
            font-weight: bold;
            text-align: center;
            margin-bottom: 12px;
            text-shadow: 0 0 5px rgba(210, 105, 30, 0.5);
        `;
        panel.appendChild(title);
        
        // Inventory grid
        const inventoryGrid = document.createElement('div');
        inventoryGrid.id = 'inventory-grid';
        inventoryGrid.style.cssText = `
            display: grid;
            grid-template-columns: repeat(8, 1fr);
            grid-template-rows: repeat(10, 1fr);
            gap: 2px;
            height: 360px;
            background: rgba(0, 0, 0, 0.2);
            padding: 8px;
            border-radius: 6px;
        `;
        
        // Create inventory slots
        for (let i = 0; i < 80; i++) {
            const slot = document.createElement('div');
            slot.className = 'inventory-slot';
            slot.dataset.slotIndex = i;
            slot.style.cssText = `
                background: rgba(0, 0, 0, 0.4);
                border: 1px solid rgba(139, 69, 19, 0.3);
                border-radius: 4px;
                cursor: pointer;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 20px;
                position: relative;
            `;
            
            slot.addEventListener('dragover', (e) => e.preventDefault());
            slot.addEventListener('drop', (e) => this.handleDrop(e, i));
            
            inventoryGrid.appendChild(slot);
        }
        
        panel.appendChild(inventoryGrid);
        return panel;
    }
    
    setupEventListeners() {
        // Bindle toggle
        document.getElementById('bindle-toggle').addEventListener('click', () => {
            this.toggleBindle();
        });
        
        // Bindle close
        document.getElementById('bindle-close').addEventListener('click', () => {
            this.hideBindle();
        });
        
        // Keyboard shortcut
        document.addEventListener('keydown', (e) => {
            if (e.key === 'i' || e.key === 'I') {
                e.preventDefault();
                this.toggleBindle();
            }
        });
    }
    
    toggleBindle() {
        this.isOpen = !this.isOpen;
        const container = document.getElementById('bindle-container');
        
        if (this.isOpen) {
            container.style.transform = 'translate(-50%, -50%) scale(1)';
            container.style.opacity = '1';
            console.log('🎒 Bindle opened');
        } else {
            container.style.transform = 'translate(-50%, -50%) scale(0)';
            container.style.opacity = '0';
            console.log('🎒 Bindle closed');
        }
    }
    
    hideBindle() {
        this.isOpen = false;
        const container = document.getElementById('bindle-container');
        container.style.transform = 'translate(-50%, -50%) scale(0)';
        container.style.opacity = '0';
    }
    
    generateStartingItems() {
        // Add some starting items to the bindle
        const startingItems = [
            { type: 'consumable', name: 'Tomato', icon: '🍅', description: 'A fresh tomato for throwing', stackable: true, quantity: 5 },
            { type: 'equipment', name: 'Pixel Mask', icon: '🎭', description: 'A retro pixel art mask for MisfitPixels fans', slot: 'head', stats: { charisma: +2, style: +1 }, rarity: 'uncommon' },
            { type: 'equipment', name: 'Pixel Boots', icon: '👟', description: 'Stylish pixel art boots', slot: 'feet', stats: { speed: +1, style: +1 }, rarity: 'uncommon' },
            { type: 'consumable', name: 'Popcorn', icon: '🍿', description: 'Classic movie snack', stackable: true, quantity: 3 },
            { type: 'equipment', name: 'Pixel Wand', icon: '🪄', description: 'A magical pixel art wand that enhances abilities', slot: 'rightHand', stats: { power: +1, magic: +1 }, rarity: 'rare' }
        ];
        
        startingItems.forEach((item, index) => {
            this.addItemToInventory(item, index);
        });
        
        console.log('🎒 Starting items added to bindle');
    }
    
    addItemToInventory(item, slotIndex = null) {
        // Find empty slot if none specified
        if (slotIndex === null) {
            slotIndex = this.inventory.findIndex(slot => slot === null);
        }
        
        if (slotIndex === -1 || slotIndex >= this.inventory.length) {
            console.warn('Bindle is full!');
            return false;
        }
        
        // Add item to inventory
        this.inventory[slotIndex] = item;
        this.updateInventorySlotUI(slotIndex, item);
        
        return true;
    }
    
    updateInventorySlotUI(slotIndex, item) {
        const slot = document.querySelector(`[data-slot-index="${slotIndex}"]`);
        if (!slot) return;
        
        if (item) {
            slot.innerHTML = `
                <div style="font-size: 24px;">${item.icon}</div>
                ${item.stackable && item.quantity > 1 ? 
                    `<div style="position: absolute; bottom: 2px; right: 4px; font-size: 10px; background: rgba(0,0,0,0.7); padding: 1px 4px; border-radius: 3px; color: #fff;">${item.quantity}</div>` 
                    : ''}
            `;
            slot.style.background = this.getItemRarityColor(item);
            slot.title = `${item.name}\n${item.description}${item.stats ? '\n' + this.formatStats(item.stats) : ''}`;
            
            // Make draggable
            slot.draggable = true;
            slot.addEventListener('dragstart', (e) => this.handleDragStart(e, slotIndex, item));
        } else {
            slot.innerHTML = '';
            slot.style.background = 'rgba(0, 0, 0, 0.4)';
            slot.title = '';
            slot.draggable = false;
        }
    }
    
    getItemRarityColor(item) {
        const rarities = {
            common: 'rgba(128, 128, 128, 0.3)',
            uncommon: 'rgba(0, 255, 0, 0.2)',
            rare: 'rgba(0, 100, 255, 0.2)',
            epic: 'rgba(128, 0, 128, 0.2)',
            legendary: 'rgba(255, 165, 0, 0.2)'
        };
        
        return rarities[item.rarity] || rarities.common;
    }
    
    formatStats(stats) {
        return Object.entries(stats)
            .map(([stat, value]) => `${stat}: ${value > 0 ? '+' : ''}${value}`)
            .join('\n');
    }
    
    handleDragStart(e, slotIndex, item) {
        this.draggedItem = item;
        this.draggedFromSlot = slotIndex;
        
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', JSON.stringify({ slotIndex, item }));
        
        console.log('Dragging item:', item.name);
    }
    
    handleDrop(e, targetSlotIndex) {
        e.preventDefault();
        
        if (this.draggedItem && this.draggedFromSlot !== null) {
            // Move item
            this.moveItem(this.draggedFromSlot, targetSlotIndex);
            
            this.draggedItem = null;
            this.draggedFromSlot = null;
        }
    }
    
    moveItem(fromSlot, toSlot) {
        if (fromSlot === toSlot) return;
        
        const fromItem = this.inventory[fromSlot];
        const toItem = this.inventory[toSlot];
        
        // Swap items
        this.inventory[fromSlot] = toItem;
        this.inventory[toSlot] = fromItem;
        
        // Update UI
        this.updateInventorySlotUI(fromSlot, toItem);
        this.updateInventorySlotUI(toSlot, fromItem);
        
        console.log(`Moved ${fromItem?.name} from slot ${fromSlot} to ${toSlot}`);
    }
    
    equipItem(item, slotIndex) {
        if (!item || (item.type !== 'equipment' && item.type !== 'wearable')) return false;
        
        const equipSlot = item.slot;
        if (!this.equipment.hasOwnProperty(equipSlot)) return false;
        
        // Unequip current item if any
        const currentEquipped = this.equipment[equipSlot];
        if (currentEquipped) {
            // Unload 3D model if it's a wearable
            if (currentEquipped.type === 'wearable') {
                this.unequipWearable(currentEquipped);
            }
            
            // Try to put it back in inventory
            const emptySlot = this.inventory.findIndex(slot => slot === null);
            if (emptySlot !== -1) {
                this.addItemToInventory(currentEquipped, emptySlot);
            }
        }
        
        // Equip new item
        this.equipment[equipSlot] = item;
        this.inventory[slotIndex] = null;
        
        // Load 3D model if it's a wearable
        if (item.type === 'wearable') {
            this.equipWearable(item);
        }
        
        // Update UIs
        this.updateInventorySlotUI(slotIndex, null);
        this.updateEquipmentSlotUI(equipSlot, item);
        
        // Apply item effects
        this.applyItemEffects();
        
        console.log(`Equipped ${item.name} to ${equipSlot}`);
        return true;
    }
    
    async equipWearable(item) {
        if (!this.wearableManager || !item.model) return;
        
        try {
            // Load the 3D model
            const wearableModel = await this.wearableManager.loadWearable(item.model, item.slot);
            
            // Attach to avatar
            await this.wearableManager.attachWearable(wearableModel, item.slot);
            
            // Cache the loaded model
            this.loadedWearables.set(item.id, wearableModel);
            
            console.log(`🎭 Equipped wearable: ${item.name}`);
        } catch (error) {
            console.error('Failed to equip wearable:', error);
        }
    }
    
    async unequipWearable(item) {
        if (!this.wearableManager) return;
        
        try {
            // Remove from avatar
            await this.wearableManager.detachWearable(item.slot);
            
            // Remove from cache
            this.loadedWearables.delete(item.id);
            
            console.log(`🎭 Unequipped wearable: ${item.name}`);
        } catch (error) {
            console.error('Failed to unequip wearable:', error);
        }
    }
    
    updateEquipmentSlotUI(slotType, item) {
        const slot = document.querySelector(`[data-slot-type="${slotType}"]`);
        if (!slot) return;
        
        if (item) {
            slot.style.background = this.getItemRarityColor(item);
            slot.innerHTML = `<span style="font-size: 20px; margin-right: 8px;">${item.icon}</span><span style="font-size: 10px;">${item.name}</span>`;
            slot.title = `${item.name}\n${item.description}\n${this.formatStats(item.stats)}`;
        } else {
            slot.style.background = 'rgba(0, 0, 0, 0.3)';
            const slotInfo = slot.innerHTML.match(/>(.*)</);
            if (slotInfo) {
                slot.innerHTML = slot.innerHTML.replace(slotInfo[1], slotInfo[1].split(' ').slice(1).join(' '));
            }
        }
    }
    
    applyItemEffects() {
        // Calculate total stats from equipped items
        const totalStats = {};
        
        Object.values(this.equipment).forEach(item => {
            if (item && item.stats) {
                Object.entries(item.stats).forEach(([stat, value]) => {
                    totalStats[stat] = (totalStats[stat] || 0) + value;
                });
            }
        });
        
        // Apply effects to player (you can expand this)
        if (totalStats.speed) {
            // Increase movement speed
            console.log(`Speed bonus: +${totalStats.speed}`);
        }
        
        if (totalStats.power) {
            // Increase tomato throwing power
            console.log(`Power bonus: +${totalStats.power}`);
        }
        
        console.log('Applied equipment effects:', totalStats);
    }
    
    addLoot(lootItem) {
        const added = this.addItemToInventory(lootItem);
        if (added) {
            this.showLootNotification(lootItem);
        } else {
            this.showMessage('Bindle is full! Cannot pick up ' + lootItem.name, 'error');
        }
        return added;
    }
    
    showLootNotification(item) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 100px;
            right: 20px;
            background: ${this.getItemRarityColor(item)};
            border: 1px solid rgba(139, 69, 19, 0.5);
            border-radius: 8px;
            padding: 12px;
            color: #D2691E;
            font-size: 14px;
            z-index: 1001;
            backdrop-filter: blur(10px);
            transform: translateX(100%);
            transition: all 0.3s ease;
        `;
        notification.innerHTML = `
            <div style="font-size: 20px; text-align: center; margin-bottom: 4px;">${item.icon}</div>
            <div style="font-weight: bold;">${item.name}</div>
            <div style="font-size: 12px; opacity: 0.8;">Added to bindle</div>
        `;
        
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);
        
        // Animate out
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (document.body.contains(notification)) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
    
    showMessage(message, type = 'info') {
        // Reuse the main app's message system
        const messageDiv = document.createElement('div');
        messageDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.9);
            color: ${type === 'error' ? '#ff6666' : '#D2691E'};
            padding: 16px 24px;
            border-radius: 12px;
            font-size: 16px;
            font-weight: 500;
            z-index: 1002;
            text-align: center;
            border: 1px solid ${type === 'error' ? '#ff6666' : '#D2691E'};
            backdrop-filter: blur(10px);
        `;
        messageDiv.textContent = message;
        
        document.body.appendChild(messageDiv);
        
        setTimeout(() => {
            if (document.body.contains(messageDiv)) {
                document.body.removeChild(messageDiv);
            }
        }, 2000);
    }
    
    getInventoryData() {
        return {
            inventory: this.inventory,
            equipment: this.equipment
        };
    }
    
    loadInventoryData(data) {
        if (data.inventory) {
            this.inventory = data.inventory;
            this.inventory.forEach((item, index) => {
                this.updateInventorySlotUI(index, item);
            });
        }
        
        if (data.equipment) {
            this.equipment = data.equipment;
            Object.entries(this.equipment).forEach(([slot, item]) => {
                this.updateEquipmentSlotUI(slot, item);
            });
            this.applyItemEffects();
        }
    }
    
    dispose() {
        const container = document.getElementById('bindle-container');
        const toggle = document.getElementById('bindle-toggle');
        
        if (container) document.body.removeChild(container);
        if (toggle) document.body.removeChild(toggle);
    }
}

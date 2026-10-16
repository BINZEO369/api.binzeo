/* eslint-disable @typescript-eslint/no-require-imports */
// server.js - Complete API Server
// Supabase Integrated | Production Ready
// Auth & OneID Removed | Products & UI APIs Only
// ============================================

const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// ============================================
// SUPABASE CONFIGURATION
// ============================================
const SUPABASE_URL = process.env.JABIYEN_SUPABASE_URL;
const SUPABASE_KEY = process.env.JABIYEN_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('JABIYEN database environment is not configured');
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================================
// MIDDLEWARE
// ============================================
// Central gateway prefix normalization
app.use((req, res, next) => {
    const prefix = '/api/jabiyen-public';
    if (req.url.startsWith(prefix)) req.url = '/api' + req.url.slice(prefix.length);
    next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// ============================================
// HELPER FUNCTIONS
// ============================================

// Create slug from string
function createSlug(text) {
    if (!text) return '';
    return text
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
}

// Format product with category/subcategory names
function formatProduct(product) {
    if (!product) return null;
    return {
        ...product,
        category: product.categories?.name || null,
        subcategory: product.subcategories?.name || null
    };
}

function formatProducts(products) {
    if (!products) return [];
    return products.map(formatProduct);
}

// ============================================
// PRODUCTS API (Categories, Subcategories with Slug)
// ============================================

// Get all products
app.get('/api/products', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('products')
            .select(`
                *,
                categories:category_id (name),
                subcategories:subcategory_id (name)
            `)
            .order('created_at', { ascending: false });
        
        if (error) return res.status(500).json({ error: error.message });
        res.json(formatProducts(data));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get product by slug
app.get('/api/product/:slug', async (req, res) => {
    try {
        const slug = req.params.slug;
        const { data, error } = await supabase
            .from('products')
            .select(`
                *,
                categories:category_id (name),
                subcategories:subcategory_id (name)
            `)
            .order('created_at', { ascending: false });
        
        if (error) return res.status(500).json({ error: error.message });
        
        const product = data.find(p => (p.slug || createSlug(p.title)) === slug);
        if (!product) return res.status(404).json({ error: 'Product not found' });
        
        res.json(formatProduct(product));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get all categories (with slugs)
app.get('/api/categories', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('categories')
            .select('*')
            .eq('is_active', true)
            .order('sort_order', { ascending: true });
        
        if (error) return res.status(500).json({ error: error.message });
        
        const categoriesWithSlugs = data.map(cat => ({
            ...cat,
            slug: cat.slug ? cat.slug.replace(/^category\//, '') : createSlug(cat.name)
        }));
        
        res.json(categoriesWithSlugs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get category by slug
app.get('/api/categories/:slug', async (req, res) => {
    try {
        const { slug } = req.params;
        
        const { data, error } = await supabase
            .from('categories')
            .select('*')
            .eq('is_active', true);
        
        if (error) return res.status(500).json({ error: error.message });
        
        const category = data.find(cat => {
            const dbSlug = cat.slug || createSlug(cat.name);
            return dbSlug.replace(/^category\//, '') === slug;
        });
        
        if (!category) return res.status(404).json({ error: 'Category not found' });
        
        res.json({
            ...category,
            slug: category.slug ? category.slug.replace(/^category\//, '') : createSlug(category.name)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get products by category slug
app.get('/api/categories/:slug/products', async (req, res) => {
    try {
        const { slug } = req.params;
        
        const { data: categories } = await supabase
            .from('categories')
            .select('*')
            .eq('is_active', true);
        
        const category = categories.find(cat => {
            const dbSlug = cat.slug || createSlug(cat.name);
            return dbSlug.replace(/^category\//, '') === slug;
        });
        
        if (!category) return res.status(404).json({ error: 'Category not found' });
        
        const { data, error } = await supabase
            .from('products')
            .select(`
                *,
                categories:category_id (name),
                subcategories:subcategory_id (name)
            `)
            .eq('category_id', category.id)
            .order('created_at', { ascending: false });
        
        if (error) return res.status(500).json({ error: error.message });
        
        res.json(formatProducts(data));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get all subcategories
app.get('/api/subcategories', async (req, res) => {
    try {
        const { category_slug } = req.query;
        
        let query = supabase
            .from('subcategories')
            .select('*, categories(name, id, slug)')
            .eq('is_active', true)
            .order('sort_order', { ascending: true });
        
        if (category_slug) {
            const { data: categories } = await supabase
                .from('categories')
                .select('id, slug')
                .eq('is_active', true);
            
            const category = categories.find(cat => {
                const dbSlug = cat.slug || createSlug(cat.name);
                return dbSlug.replace(/^category\//, '') === category_slug;
            });
            
            if (category) {
                query = query.eq('category_id', category.id);
            } else {
                return res.status(404).json({ error: 'Category not found' });
            }
        }
        
        const { data, error } = await query;
        if (error) return res.status(500).json({ error: error.message });
        
        const subcategoriesWithSlugs = data.map(sub => ({
            ...sub,
            slug: sub.slug ? sub.slug.replace(/^category\/[^/]+\//, '') : createSlug(sub.name),
            category_slug: sub.categories ? createSlug(sub.categories.name) : ''
        }));
        
        res.json(subcategoriesWithSlugs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get subcategory by slug
app.get('/api/subcategories/:slug', async (req, res) => {
    try {
        const { slug } = req.params;
        const { category_slug } = req.query;
        
        const { data, error } = await supabase
            .from('subcategories')
            .select('*, categories(name, id, slug)')
            .eq('is_active', true);
        
        if (error) return res.status(500).json({ error: error.message });
        
        let subcategory = data.find(sub => {
            const dbSlug = sub.slug || createSlug(sub.name);
            return dbSlug.replace(/^category\/[^/]+\//, '') === slug;
        });
        
        if (category_slug && subcategory) {
            const catSlug = subcategory.categories?.slug || createSlug(subcategory.categories?.name || '');
            const cleanCatSlug = catSlug.replace(/^category\//, '');
            if (cleanCatSlug !== category_slug) {
                subcategory = null;
            }
        }
        
        if (!subcategory) return res.status(404).json({ error: 'Subcategory not found' });
        
        res.json({
            ...subcategory,
            slug: subcategory.slug ? subcategory.slug.replace(/^category\/[^/]+\//, '') : createSlug(subcategory.name),
            category_slug: subcategory.categories ? createSlug(subcategory.categories.name) : ''
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get products by subcategory slug
app.get('/api/subcategories/:slug/products', async (req, res) => {
    try {
        const { slug } = req.params;
        
        const { data: subcategories } = await supabase
            .from('subcategories')
            .select('*')
            .eq('is_active', true);
        
        const subcategory = subcategories.find(sub => {
            const dbSlug = sub.slug || createSlug(sub.name);
            return dbSlug.replace(/^category\/[^/]+\//, '') === slug;
        });
        
        if (!subcategory) return res.status(404).json({ error: 'Subcategory not found' });
        
        const { data, error } = await supabase
            .from('products')
            .select(`
                *,
                categories:category_id (name),
                subcategories:subcategory_id (name)
            `)
            .eq('subcategory_id', subcategory.id)
            .order('created_at', { ascending: false });
        
        if (error) return res.status(500).json({ error: error.message });
        
        res.json(formatProducts(data));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// MENU API
// ============================================

// Get menu hierarchy
app.get('/api/menu', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('menu_items')
            .select(`
                *,
                categories:category_id (id, name),
                subcategories:subcategory_id (id, name)
            `)
            .eq('is_active', true)
            .order('sort_order', { ascending: true });
        
        if (error) return res.status(500).json({ error: error.message });
        
        const buildMenuTree = (items, parentId = null) => {
            return items
                .filter(item => item.parent_id === parentId)
                .map(item => ({
                    ...item,
                    slug: createSlug(item.title),
                    category_slug: item.categories ? createSlug(item.categories.name) : null,
                    subcategory_slug: item.subcategories ? createSlug(item.subcategories.name) : null,
                    children: buildMenuTree(items, item.id)
                }));
        };
        
        res.json(buildMenuTree(data));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get flat menu items
app.get('/api/menu-items', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('menu_items')
            .select(`
                *,
                categories:category_id (id, name),
                subcategories:subcategory_id (id, name)
            `)
            .eq('is_active', true)
            .order('sort_order', { ascending: true });
        
        if (error) return res.status(500).json({ error: error.message });
        
        const menuItemsWithSlugs = data.map(item => ({
            ...item,
            slug: createSlug(item.title),
            category_slug: item.categories ? createSlug(item.categories.name) : null,
            subcategory_slug: item.subcategories ? createSlug(item.subcategories.name) : null
        }));
        
        res.json(menuItemsWithSlugs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get menu item by slug
app.get('/api/menu-items/:slug', async (req, res) => {
    try {
        const { slug } = req.params;
        
        const { data, error } = await supabase
            .from('menu_items')
            .select(`
                *,
                categories:category_id (id, name),
                subcategories:subcategory_id (id, name)
            `)
            .eq('is_active', true);
        
        if (error) return res.status(500).json({ error: error.message });
        
        const menuItem = data.find(item => createSlug(item.title) === slug);
        if (!menuItem) return res.status(404).json({ error: 'Menu item not found' });
        
        res.json({
            ...menuItem,
            slug: createSlug(menuItem.title),
            category_slug: menuItem.categories ? createSlug(menuItem.categories.name) : null,
            subcategory_slug: menuItem.subcategories ? createSlug(menuItem.subcategories.name) : null
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// HERO SLIDES & VIDEOS API
// ============================================

// Get hero slides
app.get('/api/hero', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('hero')
            .select('*')
            .order('created_at', { ascending: true });
        
        if (error) return res.status(500).json({ error: error.message });
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get hero videos
app.get('/api/hero-videos', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('hero_videos')
            .select('*')
            .eq('is_active', true)
            .order('sort_order', { ascending: true });
        
        if (error) return res.status(500).json({ error: error.message });
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get hero secondary items
app.get('/api/hero-secondary', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('hero_secondary')
            .select('*')
            .eq('is_active', true)
            .order('sort_order', { ascending: true });
        
        if (error) return res.status(500).json({ error: error.message });
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// NEWS API
// ============================================
app.get('/api/news', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('news')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) return res.status(500).json({ error: error.message });
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// STORY API (আমাদের গল্প)
// ============================================

// Get all active stories (sorted by sort_order)
app.get('/api/stories', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('story')
            .select('*')
            .eq('is_active', true)
            .order('sort_order', { ascending: true });

        if (error) return res.status(500).json({ error: error.message });
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get single story by ID
app.get('/api/stories/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from('story')
            .select('*')
            .eq('id', id)
            .eq('is_active', true)
            .single();

        if (error) return res.status(500).json({ error: error.message });
        if (!data) return res.status(404).json({ error: 'Story not found' });

        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// PRODUCT DETAILS API (Colors, Variants, Reviews, Videos, Banners)
// ============================================

// Get product colors
app.get('/api/product-colors', async (req, res) => {
    try {
        const slug = req.query.slug;
        if (!slug) return res.status(400).json({ error: 'Slug required' });
        
        const { data: products } = await supabase.from('products').select('*');
        const product = products.find(p => (p.slug || createSlug(p.title)) === slug);
        if (!product) return res.json([]);
        
        const { data, error } = await supabase
            .from('product_colors')
            .select('*')
            .eq('product_id', product.id)
            .order('sort_order', { ascending: true });
        
        if (error) return res.status(500).json({ error: error.message });
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get product variants
app.get('/api/product-variants', async (req, res) => {
    try {
        const slug = req.query.slug;
        if (!slug) return res.status(400).json({ error: 'Slug required' });
        
        const { data: products } = await supabase.from('products').select('*');
        const product = products.find(p => (p.slug || createSlug(p.title)) === slug);
        if (!product) return res.json([]);
        
        const { data, error } = await supabase
            .from('product_variants')
            .select('*')
            .eq('product_id', product.id)
            .order('sort_order', { ascending: true });
        
        if (error) return res.status(500).json({ error: error.message });
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get product reviews
app.get('/api/product-reviews', async (req, res) => {
    try {
        const slug = req.query.slug;
        if (!slug) return res.status(400).json({ error: 'Slug required' });
        
        const { data: products } = await supabase.from('products').select('*');
        const product = products.find(p => (p.slug || createSlug(p.title)) === slug);
        if (!product) return res.json([]);
        
        const { data, error } = await supabase
            .from('product_reviews')
            .select('*')
            .eq('product_id', product.id)
            .order('created_at', { ascending: false });
        
        if (error) return res.status(500).json({ error: error.message });
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Submit product review (Left active assuming guest reviews are allowed based on previous setup)
app.post('/api/submit-review', async (req, res) => {
    try {
        const { product_id, user_name, rating, review_text } = req.body;
        
        if (!product_id || !rating || !review_text) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        const { data, error } = await supabase
            .from('product_reviews')
            .insert([{
                product_id,
                user_name: user_name || 'Guest User',
                rating: parseInt(rating),
                review_text
            }]);
        
        if (error) return res.status(500).json({ error: error.message });
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get product videos
app.get('/api/product-videos', async (req, res) => {
    try {
        const slug = req.query.slug;
        if (!slug) return res.status(400).json({ error: 'Slug required' });
        
        const { data: products } = await supabase.from('products').select('*');
        const product = products.find(p => (p.slug || createSlug(p.title)) === slug);
        if (!product) return res.json([]);
        
        const { data, error } = await supabase
            .from('product_videos')
            .select('*')
            .eq('product_id', product.id)
            .eq('is_active', true)
            .order('sort_order', { ascending: true });
        
        if (error) return res.status(500).json({ error: error.message });
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get product banners
app.get('/api/product-banners', async (req, res) => {
    try {
        const slug = req.query.slug;
        if (!slug) return res.status(400).json({ error: 'Slug required' });
        
        const { data: products } = await supabase.from('products').select('*');
        const product = products.find(p => (p.slug || createSlug(p.title)) === slug);
        if (!product) return res.json([]);
        
        const { data, error } = await supabase
            .from('product_banners')
            .select('*')
            .eq('product_id', product.id)
            .eq('is_active', true)
            .order('sort_order', { ascending: true });
        
        if (error) return res.status(500).json({ error: error.message });
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get color sizes
app.get('/api/color-sizes', async (req, res) => {
    try {
        const ids = req.query.ids;
        if (!ids) return res.json([]);
        
        const idArray = ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
        if (!idArray.length) return res.json([]);
        
        const { data, error } = await supabase
            .from('color_sizes')
            .select('*')
            .in('color_id', idArray)
            .order('sort_order', { ascending: true });
        
        if (error) return res.status(500).json({ error: error.message });
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// ANNOUNCEMENT BAR API
// ============================================

// Get active announcement (সবচেয়ে সক্রিয় একটি)
app.get('/api/announcement', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('announcement_bar')
            .select('*')
            .eq('is_active', true)
            .lte('start_date', new Date().toISOString())
            .gte('end_date', new Date().toISOString())
            .order('created_at', { ascending: false })
            .limit(1);
        
        if (error) return res.status(500).json({ error: error.message });
        
        // যদি ডাটা থাকে তাহলে প্রথমটি রিটার্ন করবে, নাহলে null
        res.json(data && data.length > 0 ? data[0] : null);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get all active announcements (একাধিক থাকলে)
app.get('/api/announcements', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('announcement_bar')
            .select('*')
            .eq('is_active', true)
            .lte('start_date', new Date().toISOString())
            .gte('end_date', new Date().toISOString())
            .order('created_at', { ascending: false });
        
        if (error) return res.status(500).json({ error: error.message });
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// ABOUT US API (আমাদের সম্পর্কে)
// ============================================

// ============================================
// ABOUT US API (আমাদের সম্পর্কে)
// ============================================

// Get all active about us entries (sorted by sort_order)
app.get('/api/about-us/all', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('about_us')
            .select('*')
            .eq('is_active', true)
            .order('sort_order', { ascending: true });

        if (error) return res.status(500).json({ error: error.message });
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get single about us entry by ID
app.get('/api/about-us/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Skip if id is "all" (handled by route above)
        if (id === 'all') return;

        const { data, error } = await supabase
            .from('about_us')
            .select('*')
            .eq('id', id)
            .eq('is_active', true)
            .single();

        if (error) return res.status(500).json({ error: error.message });
        if (!data) return res.status(404).json({ error: 'About Us entry not found' });

        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// ============================================
// FAQ API (প্রশ্ন ও উত্তর)
// ============================================

// Get all active FAQs (sorted by sort_order)
app.get('/api/faqs', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('faq')
            .select('*')
            .eq('is_active', true)
            .order('sort_order', { ascending: true });

        if (error) return res.status(500).json({ error: error.message });
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get single FAQ by ID
app.get('/api/faqs/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from('faq')
            .select('*')
            .eq('id', id)
            .eq('is_active', true)
            .single();

        if (error) return res.status(500).json({ error: error.message });
        if (!data) return res.status(404).json({ error: 'FAQ not found' });

        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// SHIPPING POLICY API (শিপিং নীতি)
// ============================================

// Get all active shipping policy entries (sorted by sort_order)
app.get('/api/shipping-policy/all', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('shipping_policy')
            .select('*')
            .eq('is_active', true)
            .order('sort_order', { ascending: true });

        if (error) return res.status(500).json({ error: error.message });
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get single shipping policy entry by ID
app.get('/api/shipping-policy/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        if (id === 'all') return;

        const { data, error } = await supabase
            .from('shipping_policy')
            .select('*')
            .eq('id', id)
            .eq('is_active', true)
            .single();

        if (error) return res.status(500).json({ error: error.message });
        if (!data) return res.status(404).json({ error: 'Shipping policy not found' });

        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// RETURN POLICY API (রিটার্ন নীতি)
// ============================================

// Get all active return policy entries (sorted by sort_order)
app.get('/api/return-policy/all', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('return_policy')
            .select('*')
            .eq('is_active', true)
            .order('sort_order', { ascending: true });

        if (error) return res.status(500).json({ error: error.message });
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get single return policy entry by ID
app.get('/api/return-policy/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        if (id === 'all') return;

        const { data, error } = await supabase
            .from('return_policy')
            .select('*')
            .eq('id', id)
            .eq('is_active', true)
            .single();

        if (error) return res.status(500).json({ error: error.message });
        if (!data) return res.status(404).json({ error: 'Return policy not found' });

        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// BLOG API (ব্লগ)
// ============================================

// Get all active blog entries (sorted by sort_order)
app.get('/api/blog/all', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('blog')
            .select('*')
            .eq('is_active', true)
            .order('sort_order', { ascending: true });

        if (error) return res.status(500).json({ error: error.message });
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get single blog entry by ID
app.get('/api/blog/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        if (id === 'all') return;

        const { data, error } = await supabase
            .from('blog')
            .select('*')
            .eq('id', id)
            .eq('is_active', true)
            .single();

        if (error) return res.status(500).json({ error: error.message });
        if (!data) return res.status(404).json({ error: 'Blog entry not found' });

        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// PRIVACY POLICY API (গোপনীয়তা নীতি)
// ============================================

// Get all active privacy policy entries (sorted by sort_order)
app.get('/api/privacy-policy/all', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('privacy_policy')
            .select('*')
            .eq('is_active', true)
            .order('sort_order', { ascending: true });

        if (error) return res.status(500).json({ error: error.message });
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get single privacy policy entry by ID
app.get('/api/privacy-policy/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        if (id === 'all') return;

        const { data, error } = await supabase
            .from('privacy_policy')
            .select('*')
            .eq('id', id)
            .eq('is_active', true)
            .single();

        if (error) return res.status(500).json({ error: error.message });
        if (!data) return res.status(404).json({ error: 'Privacy policy not found' });

        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// TERMS & CONDITIONS API (শর্তাবলী)
// ============================================

// Get all active terms entries (sorted by sort_order)
app.get('/api/terms/all', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('terms_conditions')
            .select('*')
            .eq('is_active', true)
            .order('sort_order', { ascending: true });

        if (error) return res.status(500).json({ error: error.message });
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get single terms entry by ID
app.get('/api/terms/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        if (id === 'all') return;

        const { data, error } = await supabase
            .from('terms_conditions')
            .select('*')
            .eq('id', id)
            .eq('is_active', true)
            .single();

        if (error) return res.status(500).json({ error: error.message });
        if (!data) return res.status(404).json({ error: 'Terms entry not found' });

        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// REFUND POLICY API (ফেরত নীতি)
// ============================================

// Get all active refund policy entries (sorted by sort_order)
app.get('/api/refund-policy/all', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('refund_policy')
            .select('*')
            .eq('is_active', true)
            .order('sort_order', { ascending: true });

        if (error) return res.status(500).json({ error: error.message });
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get single refund policy entry by ID
app.get('/api/refund-policy/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        if (id === 'all') return;

        const { data, error } = await supabase
            .from('refund_policy')
            .select('*')
            .eq('id', id)
            .eq('is_active', true)
            .single();

        if (error) return res.status(500).json({ error: error.message });
        if (!data) return res.status(404).json({ error: 'Refund policy not found' });

        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// COOKIE POLICY API (কুকি নীতি)
// ============================================

// Get all active cookie policy entries (sorted by sort_order)
app.get('/api/cookie-policy/all', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('cookie_policy')
            .select('*')
            .eq('is_active', true)
            .order('sort_order', { ascending: true });

        if (error) return res.status(500).json({ error: error.message });
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get single cookie policy entry by ID
app.get('/api/cookie-policy/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        if (id === 'all') return;

        const { data, error } = await supabase
            .from('cookie_policy')
            .select('*')
            .eq('id', id)
            .eq('is_active', true)
            .single();

        if (error) return res.status(500).json({ error: error.message });
        if (!data) return res.status(404).json({ error: 'Cookie policy not found' });

        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// STORE LOCATOR API (স্টোর লোকেটর)
// ============================================

// Get all active store locator entries (sorted by sort_order)
app.get('/api/store-locator/all', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('store_locator')
            .select('*')
            .eq('is_active', true)
            .order('sort_order', { ascending: true });

        if (error) return res.status(500).json({ error: error.message });
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get single store locator entry by ID
app.get('/api/store-locator/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        if (id === 'all') return;

        const { data, error } = await supabase
            .from('store_locator')
            .select('*')
            .eq('id', id)
            .eq('is_active', true)
            .single();

        if (error) return res.status(500).json({ error: error.message });
        if (!data) return res.status(404).json({ error: 'Store locator entry not found' });

        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ============================================
// FOOTER API (Complete Footer System)
// ============================================

// Get footer content by section name
app.get('/api/footer-content/:section', async (req, res) => {
    try {
        const { section } = req.params;
        const { data, error } = await supabase
            .from('footer_content')
            .select('*')
            .eq('section_name', section)
            .eq('is_active', true)
            .single();
        
        if (error) return res.status(500).json({ error: error.message });
        res.json(data || null);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get all footer content
app.get('/api/footer-content', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('footer_content')
            .select('*')
            .eq('is_active', true);
        
        if (error) return res.status(500).json({ error: error.message });
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get footer social links
app.get('/api/footer/social-links', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('footer_social_links')
            .select('*')
            .eq('is_active', true)
            .order('sort_order', { ascending: true });
        
        if (error) return res.status(500).json({ error: error.message });
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get footer menus with quick links
app.get('/api/footer/menus', async (req, res) => {
    try {
        const { data: menus, error: menuError } = await supabase
            .from('footer_menus')
            .select('*')
            .eq('is_active', true)
            .order('sort_order', { ascending: true });
        
        if (menuError) return res.status(500).json({ error: menuError.message });
        
        const { data: links, error: linkError } = await supabase
            .from('footer_quick_links')
            .select('*')
            .eq('is_active', true)
            .order('sort_order', { ascending: true });
        
        if (linkError) return res.status(500).json({ error: linkError.message });
        
        const menuWithLinks = menus.map(menu => ({
            ...menu,
            links: links.filter(link => link.menu_id === menu.id)
        }));
        
        res.json(menuWithLinks);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get footer quick links
app.get('/api/footer/quick-links', async (req, res) => {
    try {
        const { menu_id } = req.query;
        let query = supabase
            .from('footer_quick_links')
            .select('*')
            .eq('is_active', true)
            .order('sort_order', { ascending: true });
        
        if (menu_id) {
            query = query.eq('menu_id', menu_id);
        }
        
        const { data, error } = await query;
        if (error) return res.status(500).json({ error: error.message });
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get footer payment methods
app.get('/api/footer/payment-methods', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('footer_payment_methods')
            .select('*')
            .eq('is_active', true)
            .order('sort_order', { ascending: true });
        
        if (error) return res.status(500).json({ error: error.message });
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get footer shipping partners
app.get('/api/footer/shipping-partners', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('footer_shipping_partners')
            .select('*')
            .eq('is_active', true)
            .order('sort_order', { ascending: true });
        
        if (error) return res.status(500).json({ error: error.message });
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get footer certifications
app.get('/api/footer/certifications', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('footer_certifications')
            .select('*')
            .eq('is_active', true)
            .order('sort_order', { ascending: true });
        
        if (error) return res.status(500).json({ error: error.message });
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get footer app links
app.get('/api/footer/app-links', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('footer_app_links')
            .select('*')
            .eq('is_active', true)
            .order('sort_order', { ascending: true });
        
        if (error) return res.status(500).json({ error: error.message });
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get footer country selector
app.get('/api/footer/countries', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('footer_country_selector')
            .select('*')
            .eq('is_active', true)
            .order('sort_order', { ascending: true });
        
        if (error) return res.status(500).json({ error: error.message });
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get default country
app.get('/api/footer/default-country', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('footer_country_selector')
            .select('*')
            .eq('is_active', true)
            .eq('is_default', true)
            .single();
        
        if (error) return res.status(500).json({ error: error.message });
        res.json(data || null);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get footer trust badges
app.get('/api/footer/trust-badges', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('footer_trust_badges')
            .select('*')
            .eq('is_active', true)
            .order('sort_order', { ascending: true });
        
        if (error) return res.status(500).json({ error: error.message });
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get footer settings
app.get('/api/footer/settings', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('footer_settings')
            .select('*')
            .eq('is_active', true)
            .single();
        
        if (error) return res.status(500).json({ error: error.message });
        res.json(data || null);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get complete footer data (all components)
app.get('/api/footer/complete', async (req, res) => {
    try {
        const [
            { data: content },
            { data: socialLinks },
            { data: menus },
            { data: quickLinks },
            { data: paymentMethods },
            { data: shippingPartners },
            { data: certifications },
            { data: appLinks },
            { data: countries },
            { data: trustBadges },
            { data: settings }
        ] = await Promise.all([
            supabase.from('footer_content').select('*').eq('is_active', true),
            supabase.from('footer_social_links').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
            supabase.from('footer_menus').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
            supabase.from('footer_quick_links').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
            supabase.from('footer_payment_methods').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
            supabase.from('footer_shipping_partners').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
            supabase.from('footer_certifications').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
            supabase.from('footer_app_links').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
            supabase.from('footer_country_selector').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
            supabase.from('footer_trust_badges').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
            supabase.from('footer_settings').select('*').eq('is_active', true).single()
        ]);

        const menuWithLinks = (menus || []).map(menu => ({
            ...menu,
            links: (quickLinks || []).filter(link => link.menu_id === menu.id)
        }));

        res.json({
            content: content || [],
            socialLinks: socialLinks || [],
            menus: menuWithLinks,
            paymentMethods: paymentMethods || [],
            shippingPartners: shippingPartners || [],
            certifications: certifications || [],
            appLinks: appLinks || [],
            countries: countries || [],
            trustBadges: trustBadges || [],
            settings: settings || null
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});





// ============================================
// Authentication and profile routes are owned by Central BINZEO Auth.
// GOOGLE AUTH PROXY
// ============================================

// ============================================
// PAGE ROUTES
// ============================================

// Category page (with subcategory support)
app.get('/category/:slug*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'category.html'));
});


// ============================================
// HOME SHOWCASE API (Complete)
// ============================================

// Get showcase header
app.get('/api/home-showcase/header', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('home_showcase_header')
            .select('*')
            .eq('is_active', true)
            .single();

        if (error && error.code !== 'PGRST116') {
            return res.status(500).json({ error: error.message });
        }
        
        res.json(data || null);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get showcase items with category details
app.get('/api/home-showcase/items', async (req, res) => {
    try {
        const { gender } = req.query;
        
        let query = supabase
            .from('home_showcase_items')
            .select(`
                id,
                gender,
                category_id,
                sort_order,
                is_active,
                created_at,
                updated_at,
                categories:category_id (
                    id, 
                    name, 
                    slug, 
                    image_url
                )
            `)
            .eq('is_active', true)
            .order('sort_order', { ascending: true });
        
        if (gender && ['Men', 'Women'].includes(gender)) {
            query = query.eq('gender', gender);
        }
        
        const { data, error } = await query;
        
        if (error) {
            return res.status(500).json({ error: error.message });
        }
        
        // Add slugs to categories if not present
        const enrichedData = (data || []).map(item => ({
            ...item,
            categories: item.categories ? {
                ...item.categories,
                slug: item.categories.slug || createSlug(item.categories.name)
            } : null
        }));
        
        res.json(enrichedData);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get complete showcase data
app.get('/api/home-showcase/complete', async (req, res) => {
    try {
        const [headerResult, itemsResult] = await Promise.all([
            supabase
                .from('home_showcase_header')
                .select('*')
                .eq('is_active', true)
                .single(),
            
            supabase
                .from('home_showcase_items')
                .select(`
                    id,
                    gender,
                    category_id,
                    sort_order,
                    categories:category_id (
                        id, 
                        name, 
                        slug, 
                        image_url
                    )
                `)
                .eq('is_active', true)
                .order('sort_order', { ascending: true })
        ]);

        const header = headerResult.data || null;
        const items = itemsResult.data || [];

        // Enrich and group items
        const enrichedItems = items.map(item => ({
            ...item,
            categories: item.categories ? {
                ...item.categories,
                slug: item.categories.slug || createSlug(item.categories.name)
            } : null
        }));

        const menCategories = enrichedItems.filter(item => item.gender === 'Men');
        const womenCategories = enrichedItems.filter(item => item.gender === 'Women');

        res.json({
            header,
            menCategories,
            womenCategories,
            totalCategories: items.length
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

       

module.exports = app;

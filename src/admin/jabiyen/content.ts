// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import express from "express";
import { supabase, createSlug, formatProduct, formatProducts } from "./public-context";
const router = express.Router();

router.get('/api/news', async (req, res) => {
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
router.get('/api/stories', async (req, res) => {
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
router.get('/api/stories/:id', async (req, res) => {
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
router.get('/api/product-colors', async (req, res) => {
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
router.get('/api/product-variants', async (req, res) => {
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
router.get('/api/product-reviews', async (req, res) => {
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
router.post('/api/submit-review', async (req, res) => {
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
router.get('/api/product-videos', async (req, res) => {
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
router.get('/api/product-banners', async (req, res) => {
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
router.get('/api/color-sizes', async (req, res) => {
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
router.get('/api/announcement', async (req, res) => {
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
router.get('/api/announcements', async (req, res) => {
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
router.get('/api/about-us/all', async (req, res) => {
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
router.get('/api/about-us/:id', async (req, res) => {
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
router.get('/api/faqs', async (req, res) => {
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
router.get('/api/faqs/:id', async (req, res) => {
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
router.get('/api/shipping-policy/all', async (req, res) => {
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
router.get('/api/shipping-policy/:id', async (req, res) => {
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
router.get('/api/return-policy/all', async (req, res) => {
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
router.get('/api/return-policy/:id', async (req, res) => {
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
router.get('/api/blog/all', async (req, res) => {
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
router.get('/api/blog/:id', async (req, res) => {
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
router.get('/api/privacy-policy/all', async (req, res) => {
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
router.get('/api/privacy-policy/:id', async (req, res) => {
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
router.get('/api/terms/all', async (req, res) => {
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
router.get('/api/terms/:id', async (req, res) => {
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
router.get('/api/refund-policy/all', async (req, res) => {
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
router.get('/api/refund-policy/:id', async (req, res) => {
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
router.get('/api/cookie-policy/all', async (req, res) => {
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
router.get('/api/cookie-policy/:id', async (req, res) => {
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
router.get('/api/store-locator/all', async (req, res) => {
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
router.get('/api/store-locator/:id', async (req, res) => {
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

export default router;

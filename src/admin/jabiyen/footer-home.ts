// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import express from "express";
import { supabase, createSlug, formatProduct, formatProducts } from "./public-context";
const router = express.Router();

router.get('/api/footer-content/:section', async (req, res) => {
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
router.get('/api/footer-content', async (req, res) => {
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
router.get('/api/footer/social-links', async (req, res) => {
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
router.get('/api/footer/menus', async (req, res) => {
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
router.get('/api/footer/quick-links', async (req, res) => {
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
router.get('/api/footer/payment-methods', async (req, res) => {
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
router.get('/api/footer/shipping-partners', async (req, res) => {
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
router.get('/api/footer/certifications', async (req, res) => {
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
router.get('/api/footer/app-links', async (req, res) => {
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
router.get('/api/footer/countries', async (req, res) => {
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
router.get('/api/footer/default-country', async (req, res) => {
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
router.get('/api/footer/trust-badges', async (req, res) => {
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
router.get('/api/footer/settings', async (req, res) => {
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
router.get('/api/footer/complete', async (req, res) => {
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
router.get('/category/:slug*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'category.html'));
});


// ============================================
// HOME SHOWCASE API (Complete)
// ============================================

// Get showcase header
router.get('/api/home-showcase/header', async (req, res) => {
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
router.get('/api/home-showcase/items', async (req, res) => {
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
router.get('/api/home-showcase/complete', async (req, res) => {
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

       


export default router;

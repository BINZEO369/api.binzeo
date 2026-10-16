/* eslint-disable @typescript-eslint/no-require-imports */
// ============================================
// admin-server.js - Complete Admin API Server
// Admin Auth, Management & Hero Banners | Supabase Integrated
// ============================================

const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// ============================================
// SUPABASE CONFIGURATION
// ============================================
const SUPABASE_URL = process.env.JABIYEN_SUPABASE_URL;
const SUPABASE_KEY = process.env.JABIYEN_SUPABASE_SERVICE_ROLE_KEY;
const CENTRAL_AUTH_URL = process.env.AUTH_SUPABASE_URL;
const CENTRAL_AUTH_KEY = process.env.AUTH_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY || !CENTRAL_AUTH_URL || !CENTRAL_AUTH_KEY) throw new Error('JABIYEN/Central Auth environment is not configured');
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const centralAuth = createClient(CENTRAL_AUTH_URL, CENTRAL_AUTH_KEY);

// ============================================
// MIDDLEWARE
// ============================================
// Central gateway prefix normalization
app.use((req, res, next) => {
    const prefix = '/api/jabiyen-admin';
    if (req.url.startsWith(prefix)) req.url = '/api' + req.url.slice(prefix.length);
    next();
});

app.use(express.json());

// ============================================
// Central BINZEO Auth middleware. JABIYEN stores only commerce/content data.
async function adminAuth(req, res, next) {
    try {
        const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
        if (!token) return res.status(401).json({ success: false, error: 'Central access token required' });
        const { data: { user }, error: authError } = await centralAuth.auth.getUser(token);
        if (authError || !user) return res.status(401).json({ success: false, error: 'Invalid Central access token' });
        const userClient = createClient(CENTRAL_AUTH_URL, CENTRAL_AUTH_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } });
        const { data: access, error: accessError } = await userClient.from('admin_access').select('roles,permissions,is_active').eq('user_id', user.id).maybeSingle();
        if (accessError || !access?.is_active) return res.status(403).json({ success: false, error: 'Central admin access required' });
        req.user = user;
        req.admin = { ...access, role: Array.isArray(access.roles) && access.roles.includes('super_admin') ? 'super_admin' : 'admin' };
        next();
    } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
}
async function superAdminAuth(req, res, next) {
    await adminAuth(req, res, () => {
        if (req.admin?.role !== 'super_admin') return res.status(403).json({ success: false, error: 'Central super admin access required' });
        next();
    });
}

// Login, profile and admin-account management are owned by Central BINZEO Auth.
// ============================================
// DASHBOARD STATS API
// ============================================

app.get('/api/admin/stats', adminAuth, async (req, res) => {
    try {
        const [
            { count: productsCount },
            { count: categoriesCount },
            { count: ordersCount },
            { count: usersCount }
        ] = await Promise.all([
            supabase.from('products').select('*', { count: 'exact', head: true }),
            supabase.from('categories').select('*', { count: 'exact', head: true }),
            supabase.from('orders').select('*', { count: 'exact', head: true }),
            supabase.from('profiles').select('*', { count: 'exact', head: true })
        ]);

        res.json({
            success: true,
            stats: {
                products: productsCount || 0,
                categories: categoriesCount || 0,
                orders: ordersCount || 0,
                users: usersCount || 0
            }
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// ============================================
// HERO BANNERS MANAGEMENT API
// ============================================

// ============================================
// PRIMARY HERO BANNERS
// ============================================

// Get all hero banners (admin - including inactive)
app.get('/api/admin/hero', adminAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('hero')
            .select('*')
            .order('sort_order', { ascending: true });

        if (error) throw error;

        res.json({
            success: true,
            banners: data || []
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Get single hero banner
app.get('/api/admin/hero/:id', adminAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('hero')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error) throw error;
        if (!data) {
            return res.status(404).json({ 
                success: false, 
                error: 'Hero banner not found' 
            });
        }

        res.json({
            success: true,
            banner: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Create new hero banner
app.post('/api/admin/hero', adminAuth, async (req, res) => {
    try {
        const { title, subtitle, img, cta_text, cta_link, is_active, sort_order } = req.body;

        if (!img) {
            return res.status(400).json({ 
                success: false, 
                error: 'Image URL is required' 
            });
        }

        const { data, error } = await supabase
            .from('hero')
            .insert([{
                title: title || '',
                subtitle: subtitle || '',
                img: img,
                cta_text: cta_text || '',
                cta_link: cta_link || '',
                is_active: is_active !== undefined ? is_active : true,
                sort_order: sort_order || 0
            }])
            .select()
            .single();

        if (error) throw error;

        res.status(201).json({
            success: true,
            message: 'Hero banner created successfully',
            banner: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Update hero banner
app.put('/api/admin/hero/:id', adminAuth, async (req, res) => {
    try {
        const { title, subtitle, img, cta_text, cta_link, is_active, sort_order } = req.body;

        const updates = {};
        if (title !== undefined) updates.title = title;
        if (subtitle !== undefined) updates.subtitle = subtitle;
        if (img !== undefined) updates.img = img;
        if (cta_text !== undefined) updates.cta_text = cta_text;
        if (cta_link !== undefined) updates.cta_link = cta_link;
        if (is_active !== undefined) updates.is_active = is_active;
        if (sort_order !== undefined) updates.sort_order = sort_order;

        const { data, error } = await supabase
            .from('hero')
            .update(updates)
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;
        if (!data) {
            return res.status(404).json({ 
                success: false, 
                error: 'Hero banner not found' 
            });
        }

        res.json({
            success: true,
            message: 'Hero banner updated successfully',
            banner: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Delete hero banner
app.delete('/api/admin/hero/:id', adminAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('hero')
            .delete()
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;
        if (!data) {
            return res.status(404).json({ 
                success: false, 
                error: 'Hero banner not found' 
            });
        }

        res.json({
            success: true,
            message: 'Hero banner deleted successfully',
            banner: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Toggle hero banner active status
app.patch('/api/admin/hero/:id/toggle', adminAuth, async (req, res) => {
    try {
        // First get current status
        const { data: current, error: fetchError } = await supabase
            .from('hero')
            .select('is_active')
            .eq('id', req.params.id)
            .single();

        if (fetchError || !current) {
            return res.status(404).json({ 
                success: false, 
                error: 'Hero banner not found' 
            });
        }

        // Toggle the status
        const { data, error } = await supabase
            .from('hero')
            .update({ is_active: !current.is_active })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;

        res.json({
            success: true,
            message: `Hero banner ${data.is_active ? 'activated' : 'deactivated'} successfully`,
            banner: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Update hero banner sort order (batch)
app.put('/api/admin/hero/reorder', adminAuth, async (req, res) => {
    try {
        const { items } = req.body; // Array of { id, sort_order }

        if (!items || !Array.isArray(items)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Items array is required' 
            });
        }

        // Update each item's sort_order
        const updates = items.map(item => 
            supabase
                .from('hero')
                .update({ sort_order: item.sort_order })
                .eq('id', item.id)
        );

        await Promise.all(updates);

        res.json({
            success: true,
            message: 'Hero banners reordered successfully'
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// ============================================
// SECONDARY HERO BANNERS
// ============================================

// Get all secondary hero banners (admin - including inactive)
app.get('/api/admin/hero-secondary', adminAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('hero_secondary')
            .select('*')
            .order('sort_order', { ascending: true });

        if (error) throw error;

        res.json({
            success: true,
            banners: data || []
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Get single secondary hero banner
app.get('/api/admin/hero-secondary/:id', adminAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('hero_secondary')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error) throw error;
        if (!data) {
            return res.status(404).json({ 
                success: false, 
                error: 'Secondary hero banner not found' 
            });
        }

        res.json({
            success: true,
            banner: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Create new secondary hero banner
app.post('/api/admin/hero-secondary', adminAuth, async (req, res) => {
    try {
        const { title, subtitle, img, cta_text, cta_link, is_active, sort_order } = req.body;

        if (!img) {
            return res.status(400).json({ 
                success: false, 
                error: 'Image URL is required' 
            });
        }

        const { data, error } = await supabase
            .from('hero_secondary')
            .insert([{
                title: title || '',
                subtitle: subtitle || '',
                img: img,
                cta_text: cta_text || '',
                cta_link: cta_link || '',
                is_active: is_active !== undefined ? is_active : true,
                sort_order: sort_order || 0
            }])
            .select()
            .single();

        if (error) throw error;

        res.status(201).json({
            success: true,
            message: 'Secondary hero banner created successfully',
            banner: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Update secondary hero banner
app.put('/api/admin/hero-secondary/:id', adminAuth, async (req, res) => {
    try {
        const { title, subtitle, img, cta_text, cta_link, is_active, sort_order } = req.body;

        const updates = {};
        if (title !== undefined) updates.title = title;
        if (subtitle !== undefined) updates.subtitle = subtitle;
        if (img !== undefined) updates.img = img;
        if (cta_text !== undefined) updates.cta_text = cta_text;
        if (cta_link !== undefined) updates.cta_link = cta_link;
        if (is_active !== undefined) updates.is_active = is_active;
        if (sort_order !== undefined) updates.sort_order = sort_order;

        const { data, error } = await supabase
            .from('hero_secondary')
            .update(updates)
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;
        if (!data) {
            return res.status(404).json({ 
                success: false, 
                error: 'Secondary hero banner not found' 
            });
        }

        res.json({
            success: true,
            message: 'Secondary hero banner updated successfully',
            banner: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Delete secondary hero banner
app.delete('/api/admin/hero-secondary/:id', adminAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('hero_secondary')
            .delete()
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;
        if (!data) {
            return res.status(404).json({ 
                success: false, 
                error: 'Secondary hero banner not found' 
            });
        }

        res.json({
            success: true,
            message: 'Secondary hero banner deleted successfully',
            banner: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Toggle secondary hero banner active status
app.patch('/api/admin/hero-secondary/:id/toggle', adminAuth, async (req, res) => {
    try {
        // First get current status
        const { data: current, error: fetchError } = await supabase
            .from('hero_secondary')
            .select('is_active')
            .eq('id', req.params.id)
            .single();

        if (fetchError || !current) {
            return res.status(404).json({ 
                success: false, 
                error: 'Secondary hero banner not found' 
            });
        }

        // Toggle the status
        const { data, error } = await supabase
            .from('hero_secondary')
            .update({ is_active: !current.is_active })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;

        res.json({
            success: true,
            message: `Secondary hero banner ${data.is_active ? 'activated' : 'deactivated'} successfully`,
            banner: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Update secondary hero banner sort order (batch)
app.put('/api/admin/hero-secondary/reorder', adminAuth, async (req, res) => {
    try {
        const { items } = req.body; // Array of { id, sort_order }

        if (!items || !Array.isArray(items)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Items array is required' 
            });
        }

        // Update each item's sort_order
        const updates = items.map(item => 
            supabase
                .from('hero_secondary')
                .update({ sort_order: item.sort_order })
                .eq('id', item.id)
        );

        await Promise.all(updates);

        res.json({
            success: true,
            message: 'Secondary hero banners reordered successfully'
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});


// ============================================
// HERO VIDEOS MANAGEMENT API
// ============================================

// Get all hero videos (admin - including inactive)
app.get('/api/admin/hero-videos', adminAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('hero_videos')
            .select('*')
            .order('sort_order', { ascending: true });

        if (error) throw error;

        res.json({
            success: true,
            videos: data || []
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Get single hero video
app.get('/api/admin/hero-videos/:id', adminAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('hero_videos')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error) throw error;
        if (!data) {
            return res.status(404).json({ 
                success: false, 
                error: 'Hero video not found' 
            });
        }

        res.json({
            success: true,
            video: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Create new hero video
app.post('/api/admin/hero-videos', adminAuth, async (req, res) => {
    try {
        const { 
            title, 
            description, 
            video_url, 
            cta_title, 
            cta_link, 
            is_active, 
            sort_order,
            meta_title,
            meta_description,
            video_schema,
            keywords
        } = req.body;

        if (!video_url) {
            return res.status(400).json({ 
                success: false, 
                error: 'Video URL is required' 
            });
        }

        const { data, error } = await supabase
            .from('hero_videos')
            .insert([{
                title: title || null,
                description: description || null,
                video_url: video_url,
                cta_title: cta_title || null,
                cta_link: cta_link || null,
                is_active: is_active !== undefined ? is_active : true,
                sort_order: sort_order || 0,
                meta_title: meta_title || null,
                meta_description: meta_description || null,
                video_schema: video_schema || null,
                keywords: keywords || null
            }])
            .select()
            .single();

        if (error) throw error;

        res.status(201).json({
            success: true,
            message: 'Hero video created successfully',
            video: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Update hero video
app.put('/api/admin/hero-videos/:id', adminAuth, async (req, res) => {
    try {
        const { 
            title, 
            description, 
            video_url, 
            cta_title, 
            cta_link, 
            is_active, 
            sort_order,
            meta_title,
            meta_description,
            video_schema,
            keywords
        } = req.body;

        const updates = {};
        if (title !== undefined) updates.title = title;
        if (description !== undefined) updates.description = description;
        if (video_url !== undefined) updates.video_url = video_url;
        if (cta_title !== undefined) updates.cta_title = cta_title;
        if (cta_link !== undefined) updates.cta_link = cta_link;
        if (is_active !== undefined) updates.is_active = is_active;
        if (sort_order !== undefined) updates.sort_order = sort_order;
        if (meta_title !== undefined) updates.meta_title = meta_title;
        if (meta_description !== undefined) updates.meta_description = meta_description;
        if (video_schema !== undefined) updates.video_schema = video_schema;
        if (keywords !== undefined) updates.keywords = keywords;

        const { data, error } = await supabase
            .from('hero_videos')
            .update(updates)
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;
        if (!data) {
            return res.status(404).json({ 
                success: false, 
                error: 'Hero video not found' 
            });
        }

        res.json({
            success: true,
            message: 'Hero video updated successfully',
            video: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Delete hero video
app.delete('/api/admin/hero-videos/:id', adminAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('hero_videos')
            .delete()
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;
        if (!data) {
            return res.status(404).json({ 
                success: false, 
                error: 'Hero video not found' 
            });
        }

        res.json({
            success: true,
            message: 'Hero video deleted successfully',
            video: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Toggle hero video active status
app.patch('/api/admin/hero-videos/:id/toggle', adminAuth, async (req, res) => {
    try {
        // First get current status
        const { data: current, error: fetchError } = await supabase
            .from('hero_videos')
            .select('is_active')
            .eq('id', req.params.id)
            .single();

        if (fetchError || !current) {
            return res.status(404).json({ 
                success: false, 
                error: 'Hero video not found' 
            });
        }

        // Toggle the status
        const { data, error } = await supabase
            .from('hero_videos')
            .update({ is_active: !current.is_active })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;

        res.json({
            success: true,
            message: `Hero video ${data.is_active ? 'activated' : 'deactivated'} successfully`,
            video: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Update hero video sort order (batch)
app.put('/api/admin/hero-videos/reorder', adminAuth, async (req, res) => {
    try {
        const { items } = req.body; // Array of { id, sort_order }

        if (!items || !Array.isArray(items)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Items array is required' 
            });
        }

        // Update each item's sort_order
        const updates = items.map(item => 
            supabase
                .from('hero_videos')
                .update({ sort_order: item.sort_order })
                .eq('id', item.id)
        );

        await Promise.all(updates);

        res.json({
            success: true,
            message: 'Hero videos reordered successfully'
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});


// ============================================
// CATEGORIES MANAGEMENT API
// ============================================

// Get all categories (admin - including inactive)
app.get('/api/admin/categories', adminAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('categories')
            .select('*')
            .order('sort_order', { ascending: true });

        if (error) throw error;

        res.json({
            success: true,
            categories: data || []
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Get single category
app.get('/api/admin/categories/:id', adminAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('categories')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error) throw error;
        if (!data) {
            return res.status(404).json({ 
                success: false, 
                error: 'Category not found' 
            });
        }

        res.json({
            success: true,
            category: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Get category with subcategories
app.get('/api/admin/categories/:id/with-subcategories', adminAuth, async (req, res) => {
    try {
        // Get category
        const { data: category, error: catError } = await supabase
            .from('categories')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (catError) throw catError;
        if (!category) {
            return res.status(404).json({ 
                success: false, 
                error: 'Category not found' 
            });
        }

        // Get subcategories for this category
        const { data: subcategories, error: subError } = await supabase
            .from('subcategories')
            .select('*')
            .eq('category_id', req.params.id)
            .order('sort_order', { ascending: true });

        if (subError) throw subError;

        res.json({
            success: true,
            category: {
                ...category,
                subcategories: subcategories || []
            }
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Create new category
app.post('/api/admin/categories', adminAuth, async (req, res) => {
    try {
        const { 
            name, 
            image_url, 
            video_url, 
            image_cta_title, 
            image_cta_link, 
            video_cta_title, 
            video_cta_link, 
            is_active, 
            sort_order,
            meta_title,
            meta_description,
            video_schema,
            keywords
        } = req.body;

        if (!name) {
            return res.status(400).json({ 
                success: false, 
                error: 'Category name is required' 
            });
        }

        const { data, error } = await supabase
            .from('categories')
            .insert([{
                name: name,
                image_url: image_url || null,
                video_url: video_url || null,
                image_cta_title: image_cta_title || null,
                image_cta_link: image_cta_link || null,
                video_cta_title: video_cta_title || null,
                video_cta_link: video_cta_link || null,
                is_active: is_active !== undefined ? is_active : true,
                sort_order: sort_order || 0,
                meta_title: meta_title || null,
                meta_description: meta_description || null,
                video_schema: video_schema || null,
                keywords: keywords || null
            }])
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Category with this name already exists' 
                });
            }
            throw error;
        }

        res.status(201).json({
            success: true,
            message: 'Category created successfully',
            category: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Update category
app.put('/api/admin/categories/:id', adminAuth, async (req, res) => {
    try {
        const { 
            name, 
            image_url, 
            video_url, 
            image_cta_title, 
            image_cta_link, 
            video_cta_title, 
            video_cta_link, 
            is_active, 
            sort_order,
            meta_title,
            meta_description,
            video_schema,
            keywords
        } = req.body;

        const updates = {};
        if (name !== undefined) updates.name = name;
        if (image_url !== undefined) updates.image_url = image_url;
        if (video_url !== undefined) updates.video_url = video_url;
        if (image_cta_title !== undefined) updates.image_cta_title = image_cta_title;
        if (image_cta_link !== undefined) updates.image_cta_link = image_cta_link;
        if (video_cta_title !== undefined) updates.video_cta_title = video_cta_title;
        if (video_cta_link !== undefined) updates.video_cta_link = video_cta_link;
        if (is_active !== undefined) updates.is_active = is_active;
        if (sort_order !== undefined) updates.sort_order = sort_order;
        if (meta_title !== undefined) updates.meta_title = meta_title;
        if (meta_description !== undefined) updates.meta_description = meta_description;
        if (video_schema !== undefined) updates.video_schema = video_schema;
        if (keywords !== undefined) updates.keywords = keywords;

        const { data, error } = await supabase
            .from('categories')
            .update(updates)
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Category with this name already exists' 
                });
            }
            throw error;
        }
        
        if (!data) {
            return res.status(404).json({ 
                success: false, 
                error: 'Category not found' 
            });
        }

        res.json({
            success: true,
            message: 'Category updated successfully',
            category: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Delete category
app.delete('/api/admin/categories/:id', adminAuth, async (req, res) => {
    try {
        // Check if category has subcategories
        const { count: subcategoryCount, error: countError } = await supabase
            .from('subcategories')
            .select('*', { count: 'exact', head: true })
            .eq('category_id', req.params.id);

        if (countError) throw countError;

        if (subcategoryCount > 0) {
            return res.status(400).json({
                success: false,
                error: `Cannot delete category. It has ${subcategoryCount} subcategories. Delete subcategories first or reassign them.`
            });
        }

        // Check if category has menu items
        const { count: menuCount, error: menuCountError } = await supabase
            .from('menu_items')
            .select('*', { count: 'exact', head: true })
            .eq('category_id', req.params.id);

        if (menuCountError) throw menuCountError;

        if (menuCount > 0) {
            return res.status(400).json({
                success: false,
                error: `Cannot delete category. It is referenced by ${menuCount} menu items. Remove references first.`
            });
        }

        const { data, error } = await supabase
            .from('categories')
            .delete()
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;
        if (!data) {
            return res.status(404).json({ 
                success: false, 
                error: 'Category not found' 
            });
        }

        res.json({
            success: true,
            message: 'Category deleted successfully',
            category: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Toggle category active status
app.patch('/api/admin/categories/:id/toggle', adminAuth, async (req, res) => {
    try {
        const { data: current, error: fetchError } = await supabase
            .from('categories')
            .select('is_active')
            .eq('id', req.params.id)
            .single();

        if (fetchError || !current) {
            return res.status(404).json({ 
                success: false, 
                error: 'Category not found' 
            });
        }

        const { data, error } = await supabase
            .from('categories')
            .update({ is_active: !current.is_active })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;

        res.json({
            success: true,
            message: `Category ${data.is_active ? 'activated' : 'deactivated'} successfully`,
            category: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Batch reorder categories
app.put('/api/admin/categories/reorder', adminAuth, async (req, res) => {
    try {
        const { items } = req.body;

        if (!items || !Array.isArray(items)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Items array is required' 
            });
        }

        const updates = items.map(item => 
            supabase
                .from('categories')
                .update({ sort_order: item.sort_order })
                .eq('id', item.id)
        );

        await Promise.all(updates);

        res.json({
            success: true,
            message: 'Categories reordered successfully'
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// ============================================
// SUBCATEGORIES MANAGEMENT API
// ============================================

// Get all subcategories (admin - including inactive)
app.get('/api/admin/subcategories', adminAuth, async (req, res) => {
    try {
        let query = supabase
            .from('subcategories')
            .select(`
                *,
                categories:category_id (id, name, slug)
            `)
            .order('sort_order', { ascending: true });

        // Optional: filter by category_id
        if (req.query.category_id) {
            query = query.eq('category_id', req.query.category_id);
        }

        const { data, error } = await query;

        if (error) throw error;

        res.json({
            success: true,
            subcategories: data || []
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Get single subcategory
app.get('/api/admin/subcategories/:id', adminAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('subcategories')
            .select(`
                *,
                categories:category_id (id, name, slug)
            `)
            .eq('id', req.params.id)
            .single();

        if (error) throw error;
        if (!data) {
            return res.status(404).json({ 
                success: false, 
                error: 'Subcategory not found' 
            });
        }

        res.json({
            success: true,
            subcategory: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Create new subcategory
app.post('/api/admin/subcategories', adminAuth, async (req, res) => {
    try {
        const { 
            category_id,
            name, 
            image_url, 
            video_url, 
            image_cta_title, 
            image_cta_link, 
            video_cta_title, 
            video_cta_link, 
            is_active, 
            sort_order,
            meta_title,
            meta_description,
            video_schema,
            keywords
        } = req.body;

        if (!category_id || !name) {
            return res.status(400).json({ 
                success: false, 
                error: 'Category ID and name are required' 
            });
        }

        // Check if category exists
        const { data: category, error: catError } = await supabase
            .from('categories')
            .select('id')
            .eq('id', category_id)
            .single();

        if (catError || !category) {
            return res.status(400).json({ 
                success: false, 
                error: 'Parent category not found' 
            });
        }

        const { data, error } = await supabase
            .from('subcategories')
            .insert([{
                category_id: category_id,
                name: name,
                image_url: image_url || null,
                video_url: video_url || null,
                image_cta_title: image_cta_title || null,
                image_cta_link: image_cta_link || null,
                video_cta_title: video_cta_title || null,
                video_cta_link: video_cta_link || null,
                is_active: is_active !== undefined ? is_active : true,
                sort_order: sort_order || 0,
                meta_title: meta_title || null,
                meta_description: meta_description || null,
                video_schema: video_schema || null,
                keywords: keywords || null
            }])
            .select(`
                *,
                categories:category_id (id, name, slug)
            `)
            .single();

        if (error) {
            if (error.code === '23505') {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Subcategory with this name already exists in this category' 
                });
            }
            throw error;
        }

        res.status(201).json({
            success: true,
            message: 'Subcategory created successfully',
            subcategory: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Update subcategory
app.put('/api/admin/subcategories/:id', adminAuth, async (req, res) => {
    try {
        const { 
            category_id,
            name, 
            image_url, 
            video_url, 
            image_cta_title, 
            image_cta_link, 
            video_cta_title, 
            video_cta_link, 
            is_active, 
            sort_order,
            meta_title,
            meta_description,
            video_schema,
            keywords
        } = req.body;

        const updates = {};
        if (category_id !== undefined) updates.category_id = category_id;
        if (name !== undefined) updates.name = name;
        if (image_url !== undefined) updates.image_url = image_url;
        if (video_url !== undefined) updates.video_url = video_url;
        if (image_cta_title !== undefined) updates.image_cta_title = image_cta_title;
        if (image_cta_link !== undefined) updates.image_cta_link = image_cta_link;
        if (video_cta_title !== undefined) updates.video_cta_title = video_cta_title;
        if (video_cta_link !== undefined) updates.video_cta_link = video_cta_link;
        if (is_active !== undefined) updates.is_active = is_active;
        if (sort_order !== undefined) updates.sort_order = sort_order;
        if (meta_title !== undefined) updates.meta_title = meta_title;
        if (meta_description !== undefined) updates.meta_description = meta_description;
        if (video_schema !== undefined) updates.video_schema = video_schema;
        if (keywords !== undefined) updates.keywords = keywords;

        // If category_id is being changed, verify new category exists
        if (category_id) {
            const { data: category, error: catError } = await supabase
                .from('categories')
                .select('id')
                .eq('id', category_id)
                .single();

            if (catError || !category) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Parent category not found' 
                });
            }
        }

        const { data, error } = await supabase
            .from('subcategories')
            .update(updates)
            .eq('id', req.params.id)
            .select(`
                *,
                categories:category_id (id, name, slug)
            `)
            .single();

        if (error) {
            if (error.code === '23505') {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Subcategory with this name already exists in this category' 
                });
            }
            throw error;
        }
        
        if (!data) {
            return res.status(404).json({ 
                success: false, 
                error: 'Subcategory not found' 
            });
        }

        res.json({
            success: true,
            message: 'Subcategory updated successfully',
            subcategory: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Delete subcategory
app.delete('/api/admin/subcategories/:id', adminAuth, async (req, res) => {
    try {
        // Check if subcategory has menu items
        const { count: menuCount, error: menuCountError } = await supabase
            .from('menu_items')
            .select('*', { count: 'exact', head: true })
            .eq('subcategory_id', req.params.id);

        if (menuCountError) throw menuCountError;

        if (menuCount > 0) {
            return res.status(400).json({
                success: false,
                error: `Cannot delete subcategory. It is referenced by ${menuCount} menu items. Remove references first.`
            });
        }

        const { data, error } = await supabase
            .from('subcategories')
            .delete()
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;
        if (!data) {
            return res.status(404).json({ 
                success: false, 
                error: 'Subcategory not found' 
            });
        }

        res.json({
            success: true,
            message: 'Subcategory deleted successfully',
            subcategory: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Toggle subcategory active status
app.patch('/api/admin/subcategories/:id/toggle', adminAuth, async (req, res) => {
    try {
        const { data: current, error: fetchError } = await supabase
            .from('subcategories')
            .select('is_active')
            .eq('id', req.params.id)
            .single();

        if (fetchError || !current) {
            return res.status(404).json({ 
                success: false, 
                error: 'Subcategory not found' 
            });
        }

        const { data, error } = await supabase
            .from('subcategories')
            .update({ is_active: !current.is_active })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;

        res.json({
            success: true,
            message: `Subcategory ${data.is_active ? 'activated' : 'deactivated'} successfully`,
            subcategory: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Batch reorder subcategories
app.put('/api/admin/subcategories/reorder', adminAuth, async (req, res) => {
    try {
        const { items } = req.body;

        if (!items || !Array.isArray(items)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Items array is required' 
            });
        }

        const updates = items.map(item => 
            supabase
                .from('subcategories')
                .update({ sort_order: item.sort_order })
                .eq('id', item.id)
        );

        await Promise.all(updates);

        res.json({
            success: true,
            message: 'Subcategories reordered successfully'
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// ============================================
// MENU ITEMS MANAGEMENT API
// ============================================

// Get all menu items (admin - including inactive)
app.get('/api/admin/menu-items', adminAuth, async (req, res) => {
    try {
        let query = supabase
            .from('menu_items')
            .select(`
                *,
                parent:parent_id (id, title),
                category:category_id (id, name, slug),
                subcategory:subcategory_id (id, name, slug, category_id)
            `)
            .order('sort_order', { ascending: true });

        // Optional filters
        if (req.query.menu_type) {
            query = query.eq('menu_type', req.query.menu_type);
        }
        if (req.query.parent_id) {
            query = query.eq('parent_id', req.query.parent_id);
        }
        if (req.query.category_id) {
            query = query.eq('category_id', req.query.category_id);
        }

        const { data, error } = await query;

        if (error) throw error;

        res.json({
            success: true,
            menu_items: data || []
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Get menu items tree structure
app.get('/api/admin/menu-items/tree', adminAuth, async (req, res) => {
    try {
        // Get all menu items ordered by sort_order
        const { data: allItems, error } = await supabase
            .from('menu_items')
            .select(`
                *,
                category:category_id (id, name, slug),
                subcategory:subcategory_id (id, name, slug)
            `)
            .order('sort_order', { ascending: true });

        if (error) throw error;

        // Build tree structure
        const buildTree = (items, parentId = null) => {
            return items
                .filter(item => item.parent_id === parentId)
                .map(item => ({
                    ...item,
                    children: buildTree(items, item.id)
                }));
        };

        const menuTree = buildTree(allItems || []);

        res.json({
            success: true,
            menu_tree: menuTree
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Get single menu item
app.get('/api/admin/menu-items/:id', adminAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('menu_items')
            .select(`
                *,
                parent:parent_id (id, title),
                category:category_id (id, name, slug),
                subcategory:subcategory_id (id, name, slug)
            `)
            .eq('id', req.params.id)
            .single();

        if (error) throw error;
        if (!data) {
            return res.status(404).json({ 
                success: false, 
                error: 'Menu item not found' 
            });
        }

        res.json({
            success: true,
            menu_item: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Create new menu item
app.post('/api/admin/menu-items', adminAuth, async (req, res) => {
    try {
        const { 
            title,
            subtitle,
            link,
            image_url,
            image_cta_title,
            image_cta_link,
            icon_class,
            badge_text,
            badge_color,
            parent_id,
            category_id,
            subcategory_id,
            menu_type,
            sort_order,
            is_active
        } = req.body;

        if (!title || !link) {
            return res.status(400).json({ 
                success: false, 
                error: 'Title and link are required' 
            });
        }

        // Validate parent_id if provided
        if (parent_id) {
            const { data: parent, error: parentError } = await supabase
                .from('menu_items')
                .select('id')
                .eq('id', parent_id)
                .single();

            if (parentError || !parent) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Parent menu item not found' 
                });
            }
        }

        // Validate category_id if provided
        if (category_id) {
            const { data: category, error: catError } = await supabase
                .from('categories')
                .select('id')
                .eq('id', category_id)
                .single();

            if (catError || !category) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Category not found' 
                });
            }
        }

        // Validate subcategory_id if provided
        if (subcategory_id) {
            const { data: subcategory, error: subError } = await supabase
                .from('subcategories')
                .select('id')
                .eq('id', subcategory_id)
                .single();

            if (subError || !subcategory) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Subcategory not found' 
                });
            }
        }

        const { data, error } = await supabase
            .from('menu_items')
            .insert([{
                title: title,
                subtitle: subtitle || null,
                link: link,
                image_url: image_url || null,
                image_cta_title: image_cta_title || null,
                image_cta_link: image_cta_link || null,
                icon_class: icon_class || null,
                badge_text: badge_text || null,
                badge_color: badge_color || null,
                parent_id: parent_id || null,
                category_id: category_id || null,
                subcategory_id: subcategory_id || null,
                menu_type: menu_type || 'link',
                sort_order: sort_order || 0,
                is_active: is_active !== undefined ? is_active : true
            }])
            .select(`
                *,
                parent:parent_id (id, title),
                category:category_id (id, name, slug),
                subcategory:subcategory_id (id, name, slug)
            `)
            .single();

        if (error) throw error;

        res.status(201).json({
            success: true,
            message: 'Menu item created successfully',
            menu_item: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Update menu item
app.put('/api/admin/menu-items/:id', adminAuth, async (req, res) => {
    try {
        const { 
            title,
            subtitle,
            link,
            image_url,
            image_cta_title,
            image_cta_link,
            icon_class,
            badge_text,
            badge_color,
            parent_id,
            category_id,
            subcategory_id,
            menu_type,
            sort_order,
            is_active
        } = req.body;

        const updates = {};
        if (title !== undefined) updates.title = title;
        if (subtitle !== undefined) updates.subtitle = subtitle;
        if (link !== undefined) updates.link = link;
        if (image_url !== undefined) updates.image_url = image_url;
        if (image_cta_title !== undefined) updates.image_cta_title = image_cta_title;
        if (image_cta_link !== undefined) updates.image_cta_link = image_cta_link;
        if (icon_class !== undefined) updates.icon_class = icon_class;
        if (badge_text !== undefined) updates.badge_text = badge_text;
        if (badge_color !== undefined) updates.badge_color = badge_color;
        if (parent_id !== undefined) updates.parent_id = parent_id;
        if (category_id !== undefined) updates.category_id = category_id;
        if (subcategory_id !== undefined) updates.subcategory_id = subcategory_id;
        if (menu_type !== undefined) updates.menu_type = menu_type;
        if (sort_order !== undefined) updates.sort_order = sort_order;
        if (is_active !== undefined) updates.is_active = is_active;

        // Validate parent_id if provided (and not null)
        if (parent_id) {
            // Prevent circular reference
            if (parent_id == req.params.id) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'A menu item cannot be its own parent' 
                });
            }

            const { data: parent, error: parentError } = await supabase
                .from('menu_items')
                .select('id')
                .eq('id', parent_id)
                .single();

            if (parentError || !parent) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Parent menu item not found' 
                });
            }
        }

        const { data, error } = await supabase
            .from('menu_items')
            .update(updates)
            .eq('id', req.params.id)
            .select(`
                *,
                parent:parent_id (id, title),
                category:category_id (id, name, slug),
                subcategory:subcategory_id (id, name, slug)
            `)
            .single();

        if (error) throw error;
        if (!data) {
            return res.status(404).json({ 
                success: false, 
                error: 'Menu item not found' 
            });
        }

        res.json({
            success: true,
            message: 'Menu item updated successfully',
            menu_item: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Delete menu item
app.delete('/api/admin/menu-items/:id', adminAuth, async (req, res) => {
    try {
        // Check if menu item has children
        const { count: childrenCount, error: countError } = await supabase
            .from('menu_items')
            .select('*', { count: 'exact', head: true })
            .eq('parent_id', req.params.id);

        if (countError) throw countError;

        if (childrenCount > 0) {
            return res.status(400).json({
                success: false,
                error: `Cannot delete menu item. It has ${childrenCount} child items. Delete children first or reassign them.`
            });
        }

        const { data, error } = await supabase
            .from('menu_items')
            .delete()
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;
        if (!data) {
            return res.status(404).json({ 
                success: false, 
                error: 'Menu item not found' 
            });
        }

        res.json({
            success: true,
            message: 'Menu item deleted successfully',
            menu_item: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Toggle menu item active status
app.patch('/api/admin/menu-items/:id/toggle', adminAuth, async (req, res) => {
    try {
        const { data: current, error: fetchError } = await supabase
            .from('menu_items')
            .select('is_active')
            .eq('id', req.params.id)
            .single();

        if (fetchError || !current) {
            return res.status(404).json({ 
                success: false, 
                error: 'Menu item not found' 
            });
        }

        const { data, error } = await supabase
            .from('menu_items')
            .update({ is_active: !current.is_active })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;

        res.json({
            success: true,
            message: `Menu item ${data.is_active ? 'activated' : 'deactivated'} successfully`,
            menu_item: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Batch reorder menu items
app.put('/api/admin/menu-items/reorder', adminAuth, async (req, res) => {
    try {
        const { items } = req.body;

        if (!items || !Array.isArray(items)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Items array is required' 
            });
        }

        const updates = items.map(item => 
            supabase
                .from('menu_items')
                .update({ sort_order: item.sort_order })
                .eq('id', item.id)
        );

        await Promise.all(updates);

        res.json({
            success: true,
            message: 'Menu items reordered successfully'
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});



// ============================================
// PRODUCTS MANAGEMENT API
// ============================================

// Get all products (admin - with pagination, search, filters)
app.get('/api/admin/products', adminAuth, async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 20, 
            search = '', 
            category_id, 
            subcategory_id,
            gender,
            is_featured,
            is_new_arrival,
            is_on_sale,
            is_best,
            is_hot,
            is_out_of_stock,
            is_limited_edition,
            sort_by = 'created_at',
            sort_order = 'desc'
        } = req.query;

        const offset = (parseInt(page) - 1) * parseInt(limit);

        let query = supabase
            .from('products')
            .select(`
                *,
                category:category_id (id, name, slug),
                subcategory:subcategory_id (id, name, slug)
            `, { count: 'exact' });

        // Search by title or SKU
        if (search) {
            query = query.or(`title.ilike.%${search}%,sku.ilike.%${search}%,barcode.ilike.%${search}%`);
        }

        // Filters
        if (category_id) query = query.eq('category_id', category_id);
        if (subcategory_id) query = query.eq('subcategory_id', subcategory_id);
        if (gender) query = query.eq('gender', gender);
        if (is_featured) query = query.eq('is_featured', is_featured === 'true');
        if (is_new_arrival) query = query.eq('is_new_arrival', is_new_arrival === 'true');
        if (is_on_sale) query = query.eq('is_on_sale', is_on_sale === 'true');
        if (is_best) query = query.eq('is_best', is_best === 'true');
        if (is_hot) query = query.eq('is_hot', is_hot === 'true');
        if (is_out_of_stock) query = query.eq('is_out_of_stock', is_out_of_stock === 'true');
        if (is_limited_edition) query = query.eq('is_limited_edition', is_limited_edition === 'true');

        // Sorting
        const validSortColumns = ['title', 'price', 'created_at', 'updated_at', 'sort_order', 'sku'];
        const validSortOrder = ['asc', 'desc'];
        const sortColumn = validSortColumns.includes(sort_by) ? sort_by : 'created_at';
        const sortDir = validSortOrder.includes(sort_order) ? sort_order : 'desc';

        query = query
            .order(sortColumn, { ascending: sortDir === 'asc' })
            .range(offset, offset + parseInt(limit) - 1);

        const { data, error, count } = await query;

        if (error) throw error;

        res.json({
            success: true,
            products: data || [],
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: count || 0,
                totalPages: Math.ceil((count || 0) / parseInt(limit))
            }
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Get all products without pagination (for dropdowns/exports)
app.get('/api/admin/products/all', adminAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('products')
            .select('id, title, sku, slug, price, img, is_active')
            .order('title', { ascending: true });

        if (error) throw error;

        res.json({
            success: true,
            products: data || []
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Get single product with videos and banners
app.get('/api/admin/products/:id', adminAuth, async (req, res) => {
    try {
        const { data: product, error: productError } = await supabase
            .from('products')
            .select(`
                *,
                category:category_id (id, name, slug),
                subcategory:subcategory_id (id, name, slug)
            `)
            .eq('id', req.params.id)
            .single();

        if (productError) throw productError;
        if (!product) {
            return res.status(404).json({ 
                success: false, 
                error: 'Product not found' 
            });
        }

        // Get product videos
        const { data: videos, error: videosError } = await supabase
            .from('product_videos')
            .select('*')
            .eq('product_id', req.params.id)
            .order('sort_order', { ascending: true });

        if (videosError) throw videosError;

        // Get product banners
        const { data: banners, error: bannersError } = await supabase
            .from('product_banners')
            .select('*')
            .eq('product_id', req.params.id)
            .order('sort_order', { ascending: true });

        if (bannersError) throw bannersError;

        res.json({
            success: true,
            product: {
                ...product,
                videos: videos || [],
                banners: banners || []
            }
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Get product by slug (public)
app.get('/api/admin/products/slug/:slug', adminAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('products')
            .select(`
                *,
                category:category_id (id, name, slug),
                subcategory:subcategory_id (id, name, slug)
            `)
            .eq('slug', req.params.slug)
            .single();

        if (error) throw error;
        if (!data) {
            return res.status(404).json({ 
                success: false, 
                error: 'Product not found' 
            });
        }

        res.json({
            success: true,
            product: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Create new product
app.post('/api/admin/products', adminAuth, async (req, res) => {
    try {
        const { 
            title,
            category_id,
            subcategory_id,
            description,
            short_description,
            fabric_type,
            gsm_type,
            fit_type,
            gender,
            tags,
            search_tags,
            print_type,
            img,
            images,
            price,
            old_price,
            is_best,
            is_hot,
            is_new_arrival,
            is_out_of_stock,
            is_limited_edition,
            is_featured,
            is_on_sale,
            seo_title,
            google_seo,
            seo_description,
            seo_keywords
        } = req.body;

        if (!title) {
            return res.status(400).json({ 
                success: false, 
                error: 'Product title is required' 
            });
        }

        // Validate category_id if provided
        if (category_id) {
            const { data: category, error: catError } = await supabase
                .from('categories')
                .select('id')
                .eq('id', category_id)
                .single();

            if (catError || !category) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Category not found' 
                });
            }
        }

        // Validate subcategory_id if provided
        if (subcategory_id) {
            const { data: subcategory, error: subError } = await supabase
                .from('subcategories')
                .select('id')
                .eq('id', subcategory_id)
                .single();

            if (subError || !subcategory) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Subcategory not found' 
                });
            }
        }

        const { data, error } = await supabase
            .from('products')
            .insert([{
                title: title,
                category_id: category_id || null,
                subcategory_id: subcategory_id || null,
                description: description || null,
                short_description: short_description || null,
                fabric_type: fabric_type || null,
                gsm_type: gsm_type || null,
                fit_type: fit_type || null,
                gender: gender || 'Unisex',
                tags: tags || null,
                search_tags: search_tags || null,
                print_type: print_type || null,
                img: img || null,
                images: images || null,
                price: price || 0,
                old_price: old_price || null,
                is_best: is_best || false,
                is_hot: is_hot || false,
                is_new_arrival: is_new_arrival || false,
                is_out_of_stock: is_out_of_stock || false,
                is_limited_edition: is_limited_edition || false,
                is_featured: is_featured || false,
                is_on_sale: is_on_sale || false,
                seo_title: seo_title || null,
                google_seo: google_seo || null,
                seo_description: seo_description || null,
                seo_keywords: seo_keywords || null
            }])
            .select(`
                *,
                category:category_id (id, name, slug),
                subcategory:subcategory_id (id, name, slug)
            `)
            .single();

        if (error) {
            if (error.code === '23505') {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Product with this title already exists (duplicate slug)' 
                });
            }
            throw error;
        }

        res.status(201).json({
            success: true,
            message: 'Product created successfully',
            product: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Update product
app.put('/api/admin/products/:id', adminAuth, async (req, res) => {
    try {
        const { 
            title,
            category_id,
            subcategory_id,
            description,
            short_description,
            fabric_type,
            gsm_type,
            fit_type,
            gender,
            tags,
            search_tags,
            print_type,
            img,
            images,
            price,
            old_price,
            is_best,
            is_hot,
            is_new_arrival,
            is_out_of_stock,
            is_limited_edition,
            is_featured,
            is_on_sale,
            seo_title,
            google_seo,
            seo_description,
            seo_keywords
        } = req.body;

        const updates = {};
        
        if (title !== undefined) updates.title = title;
        if (category_id !== undefined) updates.category_id = category_id;
        if (subcategory_id !== undefined) updates.subcategory_id = subcategory_id;
        if (description !== undefined) updates.description = description;
        if (short_description !== undefined) updates.short_description = short_description;
        if (fabric_type !== undefined) updates.fabric_type = fabric_type;
        if (gsm_type !== undefined) updates.gsm_type = gsm_type;
        if (fit_type !== undefined) updates.fit_type = fit_type;
        if (gender !== undefined) updates.gender = gender;
        if (tags !== undefined) updates.tags = tags;
        if (search_tags !== undefined) updates.search_tags = search_tags;
        if (print_type !== undefined) updates.print_type = print_type;
        if (img !== undefined) updates.img = img;
        if (images !== undefined) updates.images = images;
        if (price !== undefined) updates.price = price;
        if (old_price !== undefined) updates.old_price = old_price;
        if (is_best !== undefined) updates.is_best = is_best;
        if (is_hot !== undefined) updates.is_hot = is_hot;
        if (is_new_arrival !== undefined) updates.is_new_arrival = is_new_arrival;
        if (is_out_of_stock !== undefined) updates.is_out_of_stock = is_out_of_stock;
        if (is_limited_edition !== undefined) updates.is_limited_edition = is_limited_edition;
        if (is_featured !== undefined) updates.is_featured = is_featured;
        if (is_on_sale !== undefined) updates.is_on_sale = is_on_sale;
        if (seo_title !== undefined) updates.seo_title = seo_title;
        if (google_seo !== undefined) updates.google_seo = google_seo;
        if (seo_description !== undefined) updates.seo_description = seo_description;
        if (seo_keywords !== undefined) updates.seo_keywords = seo_keywords;

        // Validate category_id if being changed
        if (category_id) {
            const { data: category, error: catError } = await supabase
                .from('categories')
                .select('id')
                .eq('id', category_id)
                .single();

            if (catError || !category) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Category not found' 
                });
            }
        }

        // Validate subcategory_id if being changed
        if (subcategory_id) {
            const { data: subcategory, error: subError } = await supabase
                .from('subcategories')
                .select('id')
                .eq('id', subcategory_id)
                .single();

            if (subError || !subcategory) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Subcategory not found' 
                });
            }
        }

        const { data, error } = await supabase
            .from('products')
            .update(updates)
            .eq('id', req.params.id)
            .select(`
                *,
                category:category_id (id, name, slug),
                subcategory:subcategory_id (id, name, slug)
            `)
            .single();

        if (error) {
            if (error.code === '23505') {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Product with this title already exists' 
                });
            }
            throw error;
        }
        
        if (!data) {
            return res.status(404).json({ 
                success: false, 
                error: 'Product not found' 
            });
        }

        res.json({
            success: true,
            message: 'Product updated successfully',
            product: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Delete product
app.delete('/api/admin/products/:id', adminAuth, async (req, res) => {
    try {
        // Product videos and banners will be automatically deleted due to ON DELETE CASCADE
        const { data, error } = await supabase
            .from('products')
            .delete()
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;
        if (!data) {
            return res.status(404).json({ 
                success: false, 
                error: 'Product not found' 
            });
        }

        res.json({
            success: true,
            message: 'Product deleted successfully',
            product: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Bulk delete products
app.post('/api/admin/products/bulk-delete', adminAuth, async (req, res) => {
    try {
        const { ids } = req.body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Product IDs array is required' 
            });
        }

        const { error } = await supabase
            .from('products')
            .delete()
            .in('id', ids);

        if (error) throw error;

        res.json({
            success: true,
            message: `${ids.length} products deleted successfully`
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Toggle product flags
app.patch('/api/admin/products/:id/toggle-flag', adminAuth, async (req, res) => {
    try {
        const { flag } = req.body;

        const validFlags = ['is_best', 'is_hot', 'is_new_arrival', 'is_out_of_stock', 
                           'is_limited_edition', 'is_featured', 'is_on_sale'];

        if (!flag || !validFlags.includes(flag)) {
            return res.status(400).json({ 
                success: false, 
                error: `Invalid flag. Must be one of: ${validFlags.join(', ')}` 
            });
        }

        // Get current flag value
        const { data: current, error: fetchError } = await supabase
            .from('products')
            .select(flag)
            .eq('id', req.params.id)
            .single();

        if (fetchError || !current) {
            return res.status(404).json({ 
                success: false, 
                error: 'Product not found' 
            });
        }

        // Toggle the flag
        const { data, error } = await supabase
            .from('products')
            .update({ [flag]: !current[flag] })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;

        res.json({
            success: true,
            message: `${flag.replace(/_/g, ' ')} ${data[flag] ? 'enabled' : 'disabled'} successfully`,
            product: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Duplicate product
app.post('/api/admin/products/:id/duplicate', adminAuth, async (req, res) => {
    try {
        // Get original product
        const { data: original, error: fetchError } = await supabase
            .from('products')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (fetchError || !original) {
            return res.status(404).json({ 
                success: false, 
                error: 'Product not found' 
            });
        }

        // Create duplicate with modified title
        const { data, error } = await supabase
            .from('products')
            .insert([{
                title: `${original.title} (Copy)`,
                category_id: original.category_id,
                subcategory_id: original.subcategory_id,
                description: original.description,
                short_description: original.short_description,
                fabric_type: original.fabric_type,
                gsm_type: original.gsm_type,
                fit_type: original.fit_type,
                gender: original.gender,
                tags: original.tags,
                search_tags: original.search_tags,
                print_type: original.print_type,
                img: original.img,
                images: original.images,
                price: original.price,
                old_price: original.old_price,
                is_best: false,
                is_hot: false,
                is_new_arrival: false,
                is_out_of_stock: original.is_out_of_stock,
                is_limited_edition: false,
                is_featured: false,
                is_on_sale: original.is_on_sale,
                seo_title: original.seo_title,
                google_seo: original.google_seo,
                seo_description: original.seo_description,
                seo_keywords: original.seo_keywords
            }])
            .select()
            .single();

        if (error) throw error;

        res.status(201).json({
            success: true,
            message: 'Product duplicated successfully',
            product: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// ============================================
// PRODUCT VIDEOS MANAGEMENT API
// ============================================

// Get all videos for a product
app.get('/api/admin/products/:productId/videos', adminAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('product_videos')
            .select('*')
            .eq('product_id', req.params.productId)
            .order('sort_order', { ascending: true });

        if (error) throw error;

        res.json({
            success: true,
            videos: data || []
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Get single video
app.get('/api/admin/product-videos/:id', adminAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('product_videos')
            .select('*, product:product_id (id, title)')
            .eq('id', req.params.id)
            .single();

        if (error) throw error;
        if (!data) {
            return res.status(404).json({ 
                success: false, 
                error: 'Product video not found' 
            });
        }

        res.json({
            success: true,
            video: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Create product video
app.post('/api/admin/product-videos', adminAuth, async (req, res) => {
    try {
        const { 
            product_id,
            title,
            subtitle,
            video_url,
            thumbnail_url,
            click_link,
            sort_order,
            is_active
        } = req.body;

        if (!product_id || !video_url) {
            return res.status(400).json({ 
                success: false, 
                error: 'Product ID and video URL are required' 
            });
        }

        // Check if product exists
        const { data: product, error: productError } = await supabase
            .from('products')
            .select('id')
            .eq('id', product_id)
            .single();

        if (productError || !product) {
            return res.status(400).json({ 
                success: false, 
                error: 'Product not found' 
            });
        }

        const { data, error } = await supabase
            .from('product_videos')
            .insert([{
                product_id: product_id,
                title: title || null,
                subtitle: subtitle || null,
                video_url: video_url,
                thumbnail_url: thumbnail_url || null,
                click_link: click_link || null,
                sort_order: sort_order || 0,
                is_active: is_active !== undefined ? is_active : true
            }])
            .select()
            .single();

        if (error) throw error;

        res.status(201).json({
            success: true,
            message: 'Product video created successfully',
            video: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Update product video
app.put('/api/admin/product-videos/:id', adminAuth, async (req, res) => {
    try {
        const { 
            title,
            subtitle,
            video_url,
            thumbnail_url,
            click_link,
            sort_order,
            is_active
        } = req.body;

        const updates = {};
        if (title !== undefined) updates.title = title;
        if (subtitle !== undefined) updates.subtitle = subtitle;
        if (video_url !== undefined) updates.video_url = video_url;
        if (thumbnail_url !== undefined) updates.thumbnail_url = thumbnail_url;
        if (click_link !== undefined) updates.click_link = click_link;
        if (sort_order !== undefined) updates.sort_order = sort_order;
        if (is_active !== undefined) updates.is_active = is_active;

        const { data, error } = await supabase
            .from('product_videos')
            .update(updates)
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;
        if (!data) {
            return res.status(404).json({ 
                success: false, 
                error: 'Product video not found' 
            });
        }

        res.json({
            success: true,
            message: 'Product video updated successfully',
            video: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Delete product video
app.delete('/api/admin/product-videos/:id', adminAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('product_videos')
            .delete()
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;
        if (!data) {
            return res.status(404).json({ 
                success: false, 
                error: 'Product video not found' 
            });
        }

        res.json({
            success: true,
            message: 'Product video deleted successfully',
            video: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Toggle product video active status
app.patch('/api/admin/product-videos/:id/toggle', adminAuth, async (req, res) => {
    try {
        const { data: current, error: fetchError } = await supabase
            .from('product_videos')
            .select('is_active')
            .eq('id', req.params.id)
            .single();

        if (fetchError || !current) {
            return res.status(404).json({ 
                success: false, 
                error: 'Product video not found' 
            });
        }

        const { data, error } = await supabase
            .from('product_videos')
            .update({ is_active: !current.is_active })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;

        res.json({
            success: true,
            message: `Product video ${data.is_active ? 'activated' : 'deactivated'} successfully`,
            video: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// ============================================
// PRODUCT BANNERS MANAGEMENT API
// ============================================

// Get all banners for a product
app.get('/api/admin/products/:productId/banners', adminAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('product_banners')
            .select('*')
            .eq('product_id', req.params.productId)
            .order('sort_order', { ascending: true });

        if (error) throw error;

        res.json({
            success: true,
            banners: data || []
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Get single banner
app.get('/api/admin/product-banners/:id', adminAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('product_banners')
            .select('*, product:product_id (id, title)')
            .eq('id', req.params.id)
            .single();

        if (error) throw error;
        if (!data) {
            return res.status(404).json({ 
                success: false, 
                error: 'Product banner not found' 
            });
        }

        res.json({
            success: true,
            banner: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Create product banner
app.post('/api/admin/product-banners', adminAuth, async (req, res) => {
    try {
        const { 
            product_id,
            title,
            subtitle,
            banner_url,
            click_link,
            sort_order,
            is_active
        } = req.body;

        if (!product_id || !banner_url) {
            return res.status(400).json({ 
                success: false, 
                error: 'Product ID and banner URL are required' 
            });
        }

        // Check if product exists
        const { data: product, error: productError } = await supabase
            .from('products')
            .select('id')
            .eq('id', product_id)
            .single();

        if (productError || !product) {
            return res.status(400).json({ 
                success: false, 
                error: 'Product not found' 
            });
        }

        const { data, error } = await supabase
            .from('product_banners')
            .insert([{
                product_id: product_id,
                title: title || null,
                subtitle: subtitle || null,
                banner_url: banner_url,
                click_link: click_link || null,
                sort_order: sort_order || 0,
                is_active: is_active !== undefined ? is_active : true
            }])
            .select()
            .single();

        if (error) throw error;

        res.status(201).json({
            success: true,
            message: 'Product banner created successfully',
            banner: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Update product banner
app.put('/api/admin/product-banners/:id', adminAuth, async (req, res) => {
    try {
        const { 
            title,
            subtitle,
            banner_url,
            click_link,
            sort_order,
            is_active
        } = req.body;

        const updates = {};
        if (title !== undefined) updates.title = title;
        if (subtitle !== undefined) updates.subtitle = subtitle;
        if (banner_url !== undefined) updates.banner_url = banner_url;
        if (click_link !== undefined) updates.click_link = click_link;
        if (sort_order !== undefined) updates.sort_order = sort_order;
        if (is_active !== undefined) updates.is_active = is_active;

        const { data, error } = await supabase
            .from('product_banners')
            .update(updates)
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;
        if (!data) {
            return res.status(404).json({ 
                success: false, 
                error: 'Product banner not found' 
            });
        }

        res.json({
            success: true,
            message: 'Product banner updated successfully',
            banner: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Delete product banner
app.delete('/api/admin/product-banners/:id', adminAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('product_banners')
            .delete()
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;
        if (!data) {
            return res.status(404).json({ 
                success: false, 
                error: 'Product banner not found' 
            });
        }

        res.json({
            success: true,
            message: 'Product banner deleted successfully',
            banner: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Toggle product banner active status
app.patch('/api/admin/product-banners/:id/toggle', adminAuth, async (req, res) => {
    try {
        const { data: current, error: fetchError } = await supabase
            .from('product_banners')
            .select('is_active')
            .eq('id', req.params.id)
            .single();

        if (fetchError || !current) {
            return res.status(404).json({ 
                success: false, 
                error: 'Product banner not found' 
            });
        }

        const { data, error } = await supabase
            .from('product_banners')
            .update({ is_active: !current.is_active })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;

        res.json({
            success: true,
            message: `Product banner ${data.is_active ? 'activated' : 'deactivated'} successfully`,
            banner: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// ============================================
// PRODUCT STATS API
// ============================================

app.get('/api/admin/products/stats', adminAuth, async (req, res) => {
    try {
        const [
            { count: totalProducts },
            { count: activeProducts },
            { count: featuredProducts },
            { count: newArrivals },
            { count: onSale },
            { count: outOfStock },
            { count: limitedEdition }
        ] = await Promise.all([
            supabase.from('products').select('*', { count: 'exact', head: true }),
            supabase.from('products').select('*', { count: 'exact', head: true }).eq('is_out_of_stock', false),
            supabase.from('products').select('*', { count: 'exact', head: true }).eq('is_featured', true),
            supabase.from('products').select('*', { count: 'exact', head: true }).eq('is_new_arrival', true),
            supabase.from('products').select('*', { count: 'exact', head: true }).eq('is_on_sale', true),
            supabase.from('products').select('*', { count: 'exact', head: true }).eq('is_out_of_stock', true),
            supabase.from('products').select('*', { count: 'exact', head: true }).eq('is_limited_edition', true)
        ]);

        // Get product count by category
        const { data: categoryStats, error: catStatsError } = await supabase
            .from('products')
            .select('category_id, categories:category_id (name)')
            .not('category_id', 'is', null);

        const categoryCounts = {};
        if (categoryStats) {
            categoryStats.forEach(item => {
                const catName = item.categories?.name || 'Uncategorized';
                categoryCounts[catName] = (categoryCounts[catName] || 0) + 1;
            });
        }

        res.json({
            success: true,
            stats: {
                total: totalProducts || 0,
                active: activeProducts || 0,
                featured: featuredProducts || 0,
                newArrivals: newArrivals || 0,
                onSale: onSale || 0,
                outOfStock: outOfStock || 0,
                limitedEdition: limitedEdition || 0,
                byCategory: categoryCounts
            }
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});







// ============================================
// PRODUCT COLORS MANAGEMENT API
// ============================================

// Get all colors for a product
app.get('/api/admin/products/:productId/colors', adminAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('product_colors')
            .select('*')
            .eq('product_id', req.params.productId)
            .order('sort_order', { ascending: true });

        if (error) throw error;

        res.json({
            success: true,
            colors: data || []
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Get single color with its sizes
app.get('/api/admin/product-colors/:id', adminAuth, async (req, res) => {
    try {
        const { data: color, error: colorError } = await supabase
            .from('product_colors')
            .select('*, product:product_id (id, title, sku)')
            .eq('id', req.params.id)
            .single();

        if (colorError) throw colorError;
        if (!color) {
            return res.status(404).json({ 
                success: false, 
                error: 'Color not found' 
            });
        }

        // Get sizes for this color
        const { data: sizes, error: sizesError } = await supabase
            .from('color_sizes')
            .select('*')
            .eq('color_id', req.params.id)
            .order('sort_order', { ascending: true });

        if (sizesError) throw sizesError;

        res.json({
            success: true,
            color: {
                ...color,
                sizes: sizes || []
            }
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Create product color
app.post('/api/admin/product-colors', adminAuth, async (req, res) => {
    try {
        const { 
            product_id,
            color_name,
            color_code,
            color_image,
            sort_order
        } = req.body;

        if (!product_id || !color_name) {
            return res.status(400).json({ 
                success: false, 
                error: 'Product ID and color name are required' 
            });
        }

        // Check if product exists
        const { data: product, error: productError } = await supabase
            .from('products')
            .select('id')
            .eq('id', product_id)
            .single();

        if (productError || !product) {
            return res.status(400).json({ 
                success: false, 
                error: 'Product not found' 
            });
        }

        const { data, error } = await supabase
            .from('product_colors')
            .insert([{
                product_id: product_id,
                color_name: color_name,
                color_code: color_code || null,
                color_image: color_image || null,
                sort_order: sort_order || 0,
                color_stock: 0
            }])
            .select()
            .single();

        if (error) throw error;

        res.status(201).json({
            success: true,
            message: 'Product color created successfully',
            color: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Update product color
app.put('/api/admin/product-colors/:id', adminAuth, async (req, res) => {
    try {
        const { 
            color_name,
            color_code,
            color_image,
            sort_order
        } = req.body;

        const updates = {};
        if (color_name !== undefined) updates.color_name = color_name;
        if (color_code !== undefined) updates.color_code = color_code;
        if (color_image !== undefined) updates.color_image = color_image;
        if (sort_order !== undefined) updates.sort_order = sort_order;

        const { data, error } = await supabase
            .from('product_colors')
            .update(updates)
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;
        if (!data) {
            return res.status(404).json({ 
                success: false, 
                error: 'Color not found' 
            });
        }

        res.json({
            success: true,
            message: 'Product color updated successfully',
            color: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Delete product color (cascades to sizes and variants)
app.delete('/api/admin/product-colors/:id', adminAuth, async (req, res) => {
    try {
        // Check if there are variants using this color
        const { count: variantCount, error: countError } = await supabase
            .from('product_variants')
            .select('*', { count: 'exact', head: true })
            .eq('color_id', req.params.id);

        if (countError) throw countError;

        const { data, error } = await supabase
            .from('product_colors')
            .delete()
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;
        if (!data) {
            return res.status(404).json({ 
                success: false, 
                error: 'Color not found' 
            });
        }

        res.json({
            success: true,
            message: `Product color and ${variantCount || 0} associated variants deleted successfully`,
            color: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// ============================================
// COLOR SIZES MANAGEMENT API
// ============================================

// Get all sizes for a color
app.get('/api/admin/product-colors/:colorId/sizes', adminAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('color_sizes')
            .select('*')
            .eq('color_id', req.params.colorId)
            .order('sort_order', { ascending: true });

        if (error) throw error;

        res.json({
            success: true,
            sizes: data || []
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Get single size
app.get('/api/admin/color-sizes/:id', adminAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('color_sizes')
            .select('*, color:color_id (id, color_name, product_id, product:product_id (id, title))')
            .eq('id', req.params.id)
            .single();

        if (error) throw error;
        if (!data) {
            return res.status(404).json({ 
                success: false, 
                error: 'Size not found' 
            });
        }

        res.json({
            success: true,
            size: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Create color size
app.post('/api/admin/color-sizes', adminAuth, async (req, res) => {
    try {
        const { 
            color_id,
            size_name,
            sort_order
        } = req.body;

        if (!color_id || !size_name) {
            return res.status(400).json({ 
                success: false, 
                error: 'Color ID and size name are required' 
            });
        }

        // Check if color exists
        const { data: color, error: colorError } = await supabase
            .from('product_colors')
            .select('id')
            .eq('id', color_id)
            .single();

        if (colorError || !color) {
            return res.status(400).json({ 
                success: false, 
                error: 'Color not found' 
            });
        }

        const { data, error } = await supabase
            .from('color_sizes')
            .insert([{
                color_id: color_id,
                size_name: size_name,
                sort_order: sort_order || 0
            }])
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                return res.status(400).json({ 
                    success: false, 
                    error: 'This size already exists for this color' 
                });
            }
            throw error;
        }

        res.status(201).json({
            success: true,
            message: 'Size created successfully',
            size: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Update color size
app.put('/api/admin/color-sizes/:id', adminAuth, async (req, res) => {
    try {
        const { 
            size_name,
            sort_order
        } = req.body;

        const updates = {};
        if (size_name !== undefined) updates.size_name = size_name;
        if (sort_order !== undefined) updates.sort_order = sort_order;

        const { data, error } = await supabase
            .from('color_sizes')
            .update(updates)
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                return res.status(400).json({ 
                    success: false, 
                    error: 'This size already exists for this color' 
                });
            }
            throw error;
        }
        
        if (!data) {
            return res.status(404).json({ 
                success: false, 
                error: 'Size not found' 
            });
        }

        res.json({
            success: true,
            message: 'Size updated successfully',
            size: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Delete color size (cascades to variants)
app.delete('/api/admin/color-sizes/:id', adminAuth, async (req, res) => {
    try {
        // Check if there are variants using this size
        const { count: variantCount, error: countError } = await supabase
            .from('product_variants')
            .select('*', { count: 'exact', head: true })
            .eq('size_id', req.params.id);

        if (countError) throw countError;

        const { data, error } = await supabase
            .from('color_sizes')
            .delete()
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;
        if (!data) {
            return res.status(404).json({ 
                success: false, 
                error: 'Size not found' 
            });
        }

        res.json({
            success: true,
            message: `Size and ${variantCount || 0} associated variants deleted successfully`,
            size: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// ============================================
// PRODUCT VARIANTS MANAGEMENT API
// ============================================

// Get all variants for a product (with color & size details)
app.get('/api/admin/products/:productId/variants', adminAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('product_variants')
            .select(`
                *,
                color:color_id (id, color_name, color_code, color_image),
                size:size_id (id, size_name)
            `)
            .eq('product_id', req.params.productId)
            .order('sort_order', { ascending: true });

        if (error) throw error;

        res.json({
            success: true,
            variants: data || []
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Get all variants for a product grouped by color (for variant matrix view)
app.get('/api/admin/products/:productId/variants-matrix', adminAuth, async (req, res) => {
    try {
        // Get all colors for the product
        const { data: colors, error: colorsError } = await supabase
            .from('product_colors')
            .select('*')
            .eq('product_id', req.params.productId)
            .order('sort_order', { ascending: true });

        if (colorsError) throw colorsError;

        // Get all sizes across all colors
        const colorIds = (colors || []).map(c => c.id);
        let allSizes = [];
        
        if (colorIds.length > 0) {
            const { data: sizes, error: sizesError } = await supabase
                .from('color_sizes')
                .select('*')
                .in('color_id', colorIds)
                .order('sort_order', { ascending: true });

            if (sizesError) throw sizesError;
            allSizes = sizes || [];
        }

        // Get all variants
        const { data: variants, error: variantsError } = await supabase
            .from('product_variants')
            .select('*')
            .eq('product_id', req.params.productId);

        if (variantsError) throw variantsError;

        // Build matrix
        const matrix = (colors || []).map(color => {
            const colorSizes = allSizes.filter(s => s.color_id === color.id);
            const sizeVariants = colorSizes.map(size => {
                const variant = (variants || []).find(
                    v => v.color_id === color.id && v.size_id === size.id
                );
                return {
                    size_id: size.id,
                    size_name: size.size_name,
                    variant: variant || null
                };
            });
            return {
                color_id: color.id,
                color_name: color.color_name,
                color_code: color.color_code,
                color_image: color.color_image,
                color_stock: color.color_stock,
                sizes: sizeVariants
            };
        });

        res.json({
            success: true,
            matrix: matrix,
            allSizes: allSizes,
            variants: variants || []
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Get single variant
app.get('/api/admin/product-variants/:id', adminAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('product_variants')
            .select(`
                *,
                color:color_id (id, color_name, color_code, color_image),
                size:size_id (id, size_name),
                product:product_id (id, title, sku, price, img)
            `)
            .eq('id', req.params.id)
            .single();

        if (error) throw error;
        if (!data) {
            return res.status(404).json({ 
                success: false, 
                error: 'Variant not found' 
            });
        }

        res.json({
            success: true,
            variant: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Create variant (single)
app.post('/api/admin/product-variants', adminAuth, async (req, res) => {
    try {
        const { 
            product_id,
            color_id,
            size_id,
            price,
            old_price,
            stock,
            is_active,
            sort_order,
            material,
            weight
        } = req.body;

        if (!product_id || !color_id || !size_id || price === undefined) {
            return res.status(400).json({ 
                success: false, 
                error: 'Product ID, color ID, size ID and price are required' 
            });
        }

        // Check if product exists
        const { data: product, error: productError } = await supabase
            .from('products')
            .select('id')
            .eq('id', product_id)
            .single();

        if (productError || !product) {
            return res.status(400).json({ 
                success: false, 
                error: 'Product not found' 
            });
        }

        // Check if color exists and belongs to product
        const { data: color, error: colorError } = await supabase
            .from('product_colors')
            .select('id')
            .eq('id', color_id)
            .eq('product_id', product_id)
            .single();

        if (colorError || !color) {
            return res.status(400).json({ 
                success: false, 
                error: 'Color not found or does not belong to this product' 
            });
        }

        // Check if size exists and belongs to color
        const { data: size, error: sizeError } = await supabase
            .from('color_sizes')
            .select('id')
            .eq('id', size_id)
            .eq('color_id', color_id)
            .single();

        if (sizeError || !size) {
            return res.status(400).json({ 
                success: false, 
                error: 'Size not found or does not belong to this color' 
            });
        }

        const { data, error } = await supabase
            .from('product_variants')
            .insert([{
                product_id: product_id,
                color_id: color_id,
                size_id: size_id,
                price: price,
                old_price: old_price || null,
                stock: stock || 0,
                is_active: is_active !== undefined ? is_active : true,
                sort_order: sort_order || 0,
                material: material || null,
                weight: weight || 0
            }])
            .select(`
                *,
                color:color_id (id, color_name, color_code, color_image),
                size:size_id (id, size_name)
            `)
            .single();

        if (error) {
            if (error.code === '23505') {
                return res.status(400).json({ 
                    success: false, 
                    error: 'This variant combination already exists' 
                });
            }
            throw error;
        }

        res.status(201).json({
            success: true,
            message: 'Variant created successfully',
            variant: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Bulk create variants for a color with multiple sizes
app.post('/api/admin/product-variants/bulk', adminAuth, async (req, res) => {
    try {
        const { 
            product_id,
            color_id,
            size_ids, // Array of size IDs
            price,
            old_price,
            stock,
            is_active,
            material,
            weight
        } = req.body;

        if (!product_id || !color_id || !size_ids || !Array.isArray(size_ids) || size_ids.length === 0 || price === undefined) {
            return res.status(400).json({ 
                success: false, 
                error: 'Product ID, color ID, size IDs array and price are required' 
            });
        }

        // Check if product exists
        const { data: product, error: productError } = await supabase
            .from('products')
            .select('id')
            .eq('id', product_id)
            .single();

        if (productError || !product) {
            return res.status(400).json({ 
                success: false, 
                error: 'Product not found' 
            });
        }

        // Check if color exists and belongs to product
        const { data: color, error: colorError } = await supabase
            .from('product_colors')
            .select('id')
            .eq('id', color_id)
            .eq('product_id', product_id)
            .single();

        if (colorError || !color) {
            return res.status(400).json({ 
                success: false, 
                error: 'Color not found or does not belong to this product' 
            });
        }

        // Validate all size IDs belong to this color
        const { data: validSizes, error: sizesError } = await supabase
            .from('color_sizes')
            .select('id')
            .eq('color_id', color_id)
            .in('id', size_ids);

        if (sizesError) throw sizesError;

        if (!validSizes || validSizes.length !== size_ids.length) {
            return res.status(400).json({ 
                success: false, 
                error: 'One or more size IDs are invalid or do not belong to this color' 
            });
        }

        // Create variants for each size
        const variantsToInsert = size_ids.map(size_id => ({
            product_id: product_id,
            color_id: color_id,
            size_id: size_id,
            price: price,
            old_price: old_price || null,
            stock: stock || 0,
            is_active: is_active !== undefined ? is_active : true,
            sort_order: 0,
            material: material || null,
            weight: weight || 0
        }));

        const { data, error } = await supabase
            .from('product_variants')
            .insert(variantsToInsert)
            .select(`
                *,
                color:color_id (id, color_name, color_code, color_image),
                size:size_id (id, size_name)
            `);

        if (error) {
            if (error.code === '23505') {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Some variant combinations already exist. Duplicates were skipped.' 
                });
            }
            throw error;
        }

        res.status(201).json({
            success: true,
            message: `${data.length} variants created successfully`,
            variants: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Generate all missing variants for a product (auto-generate all color-size combinations)
app.post('/api/admin/products/:productId/generate-variants', adminAuth, async (req, res) => {
    try {
        const productId = req.params.productId;
        const { default_price, default_stock } = req.body;

        if (default_price === undefined) {
            return res.status(400).json({ 
                success: false, 
                error: 'Default price is required' 
            });
        }

        // Check if product exists
        const { data: product, error: productError } = await supabase
            .from('products')
            .select('id, price')
            .eq('id', productId)
            .single();

        if (productError || !product) {
            return res.status(404).json({ 
                success: false, 
                error: 'Product not found' 
            });
        }

        // Get all colors for product
        const { data: colors, error: colorsError } = await supabase
            .from('product_colors')
            .select('id, color_name')
            .eq('product_id', productId);

        if (colorsError) throw colorsError;

        if (!colors || colors.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'No colors found for this product. Add colors first.' 
            });
        }

        // Get all existing variants
        const { data: existingVariants, error: existingError } = await supabase
            .from('product_variants')
            .select('color_id, size_id')
            .eq('product_id', productId);

        if (existingError) throw existingError;

        const existingSet = new Set(
            (existingVariants || []).map(v => `${v.color_id}-${v.size_id}`)
        );

        // Generate new variants
        const newVariants = [];
        let totalCreated = 0;

        for (const color of colors) {
            const { data: sizes, error: sizesError } = await supabase
                .from('color_sizes')
                .select('id, size_name')
                .eq('color_id', color.id);

            if (sizesError) throw sizesError;

            for (const size of (sizes || [])) {
                const key = `${color.id}-${size.id}`;
                if (!existingSet.has(key)) {
                    newVariants.push({
                        product_id: parseInt(productId),
                        color_id: color.id,
                        size_id: size.id,
                        price: default_price,
                        stock: default_stock || 0,
                        is_active: true,
                        sort_order: 0
                    });
                }
            }
        }

        if (newVariants.length === 0) {
            return res.json({
                success: true,
                message: 'All variants already exist. Nothing to generate.',
                created: 0,
                variants: []
            });
        }

        const { data, error } = await supabase
            .from('product_variants')
            .insert(newVariants)
            .select(`
                *,
                color:color_id (id, color_name, color_code),
                size:size_id (id, size_name)
            `);

        if (error) throw error;

        res.status(201).json({
            success: true,
            message: `${data.length} new variants generated successfully`,
            created: data.length,
            variants: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Update variant
app.put('/api/admin/product-variants/:id', adminAuth, async (req, res) => {
    try {
        const { 
            color_id,
            size_id,
            price,
            old_price,
            stock,
            is_active,
            sort_order,
            material,
            weight
        } = req.body;

        const updates = {};
        if (color_id !== undefined) updates.color_id = color_id;
        if (size_id !== undefined) updates.size_id = size_id;
        if (price !== undefined) updates.price = price;
        if (old_price !== undefined) updates.old_price = old_price;
        if (stock !== undefined) updates.stock = stock;
        if (is_active !== undefined) updates.is_active = is_active;
        if (sort_order !== undefined) updates.sort_order = sort_order;
        if (material !== undefined) updates.material = material;
        if (weight !== undefined) updates.weight = weight;

        const { data, error } = await supabase
            .from('product_variants')
            .update(updates)
            .eq('id', req.params.id)
            .select(`
                *,
                color:color_id (id, color_name, color_code, color_image),
                size:size_id (id, size_name)
            `)
            .single();

        if (error) {
            if (error.code === '23505') {
                return res.status(400).json({ 
                    success: false, 
                    error: 'This variant combination already exists' 
                });
            }
            throw error;
        }
        
        if (!data) {
            return res.status(404).json({ 
                success: false, 
                error: 'Variant not found' 
            });
        }

        res.json({
            success: true,
            message: 'Variant updated successfully',
            variant: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Bulk update variants (update multiple variants at once)
app.put('/api/admin/product-variants/bulk', adminAuth, async (req, res) => {
    try {
        const { variants } = req.body; // Array of { id, price, old_price, stock, is_active }

        if (!variants || !Array.isArray(variants) || variants.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Variants array is required' 
            });
        }

        const updates = variants.map(variant => {
            const updateData = {};
            if (variant.price !== undefined) updateData.price = variant.price;
            if (variant.old_price !== undefined) updateData.old_price = variant.old_price;
            if (variant.stock !== undefined) updateData.stock = variant.stock;
            if (variant.is_active !== undefined) updateData.is_active = variant.is_active;
            if (variant.sort_order !== undefined) updateData.sort_order = variant.sort_order;
            if (variant.material !== undefined) updateData.material = variant.material;
            if (variant.weight !== undefined) updateData.weight = variant.weight;
            
            return supabase
                .from('product_variants')
                .update(updateData)
                .eq('id', variant.id);
        });

        await Promise.all(updates);

        res.json({
            success: true,
            message: `${variants.length} variants updated successfully`
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Delete variant
app.delete('/api/admin/product-variants/:id', adminAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('product_variants')
            .delete()
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;
        if (!data) {
            return res.status(404).json({ 
                success: false, 
                error: 'Variant not found' 
            });
        }

        res.json({
            success: true,
            message: 'Variant deleted successfully',
            variant: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Bulk delete variants
app.post('/api/admin/product-variants/bulk-delete', adminAuth, async (req, res) => {
    try {
        const { ids } = req.body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Variant IDs array is required' 
            });
        }

        const { error } = await supabase
            .from('product_variants')
            .delete()
            .in('id', ids);

        if (error) throw error;

        res.json({
            success: true,
            message: `${ids.length} variants deleted successfully`
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Toggle variant active status
app.patch('/api/admin/product-variants/:id/toggle', adminAuth, async (req, res) => {
    try {
        const { data: current, error: fetchError } = await supabase
            .from('product_variants')
            .select('is_active, stock')
            .eq('id', req.params.id)
            .single();

        if (fetchError || !current) {
            return res.status(404).json({ 
                success: false, 
                error: 'Variant not found' 
            });
        }

        // Prevent activating zero-stock variants
        if (!current.is_active && current.stock <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Cannot activate variant with zero stock. Please add stock first.'
            });
        }

        const { data, error } = await supabase
            .from('product_variants')
            .update({ is_active: !current.is_active })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;

        res.json({
            success: true,
            message: `Variant ${data.is_active ? 'activated' : 'deactivated'} successfully`,
            variant: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Update variant stock (add, subtract, or set)
app.patch('/api/admin/product-variants/:id/stock', adminAuth, async (req, res) => {
    try {
        const { action, quantity } = req.body;
        // action: 'add', 'subtract', 'set'
        // quantity: number

        if (!action || quantity === undefined) {
            return res.status(400).json({ 
                success: false, 
                error: 'Action (add/subtract/set) and quantity are required' 
            });
        }

        const { data: current, error: fetchError } = await supabase
            .from('product_variants')
            .select('stock')
            .eq('id', req.params.id)
            .single();

        if (fetchError || !current) {
            return res.status(404).json({ 
                success: false, 
                error: 'Variant not found' 
            });
        }

        let newStock;
        switch (action) {
            case 'add':
                newStock = current.stock + parseInt(quantity);
                break;
            case 'subtract':
                newStock = Math.max(0, current.stock - parseInt(quantity));
                break;
            case 'set':
                newStock = parseInt(quantity);
                break;
            default:
                return res.status(400).json({ 
                    success: false, 
                    error: 'Invalid action. Use add, subtract, or set.' 
                });
        }

        const { data, error } = await supabase
            .from('product_variants')
            .update({ stock: newStock })
            .eq('id', req.params.id)
            .select(`
                *,
                color:color_id (id, color_name),
                size:size_id (id, size_name)
            `)
            .single();

        if (error) throw error;

        res.json({
            success: true,
            message: `Stock ${action === 'add' ? 'increased' : action === 'subtract' ? 'decreased' : 'updated'} successfully. New stock: ${newStock}`,
            variant: data,
            previous_stock: current.stock,
            new_stock: newStock
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Get variant statistics for a product
app.get('/api/admin/products/:productId/variants-stats', adminAuth, async (req, res) => {
    try {
        const productId = req.params.productId;

        const [
            { count: totalVariants },
            { count: activeVariants },
            { count: inStockVariants },
            { count: outOfStockVariants },
            { data: stockData, error: stockError }
        ] = await Promise.all([
            supabase.from('product_variants').select('*', { count: 'exact', head: true }).eq('product_id', productId),
            supabase.from('product_variants').select('*', { count: 'exact', head: true }).eq('product_id', productId).eq('is_active', true),
            supabase.from('product_variants').select('*', { count: 'exact', head: true }).eq('product_id', productId).gt('stock', 0),
            supabase.from('product_variants').select('*', { count: 'exact', head: true }).eq('product_id', productId).eq('stock', 0),
            supabase.from('product_variants').select('stock, price').eq('product_id', productId)
        ]);

        if (stockError) throw stockError;

        const totalStock = (stockData || []).reduce((sum, v) => sum + (v.stock || 0), 0);
        const totalValue = (stockData || []).reduce((sum, v) => sum + ((v.stock || 0) * (v.price || 0)), 0);
        
        // Get color count
        const { count: colorCount } = await supabase
            .from('product_colors')
            .select('*', { count: 'exact', head: true })
            .eq('product_id', productId);

        // Get total sizes count
        const { data: colorIds } = await supabase
            .from('product_colors')
            .select('id')
            .eq('product_id', productId);

        let sizeCount = 0;
        if (colorIds && colorIds.length > 0) {
            const { count } = await supabase
                .from('color_sizes')
                .select('*', { count: 'exact', head: true })
                .in('color_id', colorIds.map(c => c.id));
            sizeCount = count || 0;
        }

        res.json({
            success: true,
            stats: {
                totalVariants: totalVariants || 0,
                activeVariants: activeVariants || 0,
                inStockVariants: inStockVariants || 0,
                outOfStockVariants: outOfStockVariants || 0,
                totalStock: totalStock,
                totalValue: totalValue,
                colors: colorCount || 0,
                sizes: sizeCount,
                averagePrice: totalVariants > 0 
                    ? (stockData || []).reduce((sum, v) => sum + (v.price || 0), 0) / totalVariants 
                    : 0
            }
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Search variants by SKU or barcode
app.get('/api/admin/product-variants/search', adminAuth, async (req, res) => {
    try {
        const { q } = req.query;

        if (!q) {
            return res.status(400).json({ 
                success: false, 
                error: 'Search query (q) is required' 
            });
        }

        const { data, error } = await supabase
            .from('product_variants')
            .select(`
                *,
                color:color_id (id, color_name, color_code),
                size:size_id (id, size_name),
                product:product_id (id, title, sku, img)
            `)
            .or(`sku.ilike.%${q}%,barcode.ilike.%${q}%,name.ilike.%${q}%`)
            .limit(20);

        if (error) throw error;

        res.json({
            success: true,
            variants: data || [],
            count: (data || []).length
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Get variant by SKU
app.get('/api/admin/product-variants/sku/:sku', adminAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('product_variants')
            .select(`
                *,
                color:color_id (id, color_name, color_code),
                size:size_id (id, size_name),
                product:product_id (id, title, sku, img)
            `)
            .eq('sku', req.params.sku)
            .single();

        if (error) throw error;
        if (!data) {
            return res.status(404).json({ 
                success: false, 
                error: 'Variant not found' 
            });
        }

        res.json({
            success: true,
            variant: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Get variant by barcode
app.get('/api/admin/product-variants/barcode/:barcode', adminAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('product_variants')
            .select(`
                *,
                color:color_id (id, color_name, color_code),
                size:size_id (id, size_name),
                product:product_id (id, title, sku, img)
            `)
            .eq('barcode', req.params.barcode)
            .single();

        if (error) throw error;
        if (!data) {
            return res.status(404).json({ 
                success: false, 
                error: 'Variant not found' 
            });
        }

        res.json({
            success: true,
            variant: data
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

module.exports = app;

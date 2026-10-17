// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import express from "express";
import { supabase, adminAuth, superAdminAuth } from "./admin-context";
const router = express.Router();

router.get('/api/admin/stats', adminAuth, async (req, res) => {
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
            supabase.from('customer_profiles').select('*', { count: 'exact', head: true })
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
router.get('/api/admin/hero', adminAuth, async (req, res) => {
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
router.get('/api/admin/hero/:id', adminAuth, async (req, res) => {
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
router.post('/api/admin/hero', adminAuth, async (req, res) => {
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
router.put('/api/admin/hero/:id', adminAuth, async (req, res) => {
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
router.delete('/api/admin/hero/:id', adminAuth, async (req, res) => {
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
router.patch('/api/admin/hero/:id/toggle', adminAuth, async (req, res) => {
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
router.put('/api/admin/hero/reorder', adminAuth, async (req, res) => {
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
router.get('/api/admin/hero-secondary', adminAuth, async (req, res) => {
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
router.get('/api/admin/hero-secondary/:id', adminAuth, async (req, res) => {
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
router.post('/api/admin/hero-secondary', adminAuth, async (req, res) => {
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
router.put('/api/admin/hero-secondary/:id', adminAuth, async (req, res) => {
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
router.delete('/api/admin/hero-secondary/:id', adminAuth, async (req, res) => {
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
router.patch('/api/admin/hero-secondary/:id/toggle', adminAuth, async (req, res) => {
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
router.put('/api/admin/hero-secondary/reorder', adminAuth, async (req, res) => {
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
router.get('/api/admin/hero-videos', adminAuth, async (req, res) => {
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
router.get('/api/admin/hero-videos/:id', adminAuth, async (req, res) => {
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
router.post('/api/admin/hero-videos', adminAuth, async (req, res) => {
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
router.put('/api/admin/hero-videos/:id', adminAuth, async (req, res) => {
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
router.delete('/api/admin/hero-videos/:id', adminAuth, async (req, res) => {
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
router.patch('/api/admin/hero-videos/:id/toggle', adminAuth, async (req, res) => {
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
router.put('/api/admin/hero-videos/reorder', adminAuth, async (req, res) => {
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

export default router;

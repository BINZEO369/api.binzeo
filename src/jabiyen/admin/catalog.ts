// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import express from "express";
import { supabase, adminAuth, superAdminAuth } from "./admin-context";
const router = express.Router();

router.get('/api/admin/categories', adminAuth, async (req, res) => {
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
router.get('/api/admin/categories/:id', adminAuth, async (req, res) => {
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
router.get('/api/admin/categories/:id/with-subcategories', adminAuth, async (req, res) => {
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
router.post('/api/admin/categories', adminAuth, async (req, res) => {
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
router.put('/api/admin/categories/:id', adminAuth, async (req, res) => {
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
router.delete('/api/admin/categories/:id', adminAuth, async (req, res) => {
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
router.patch('/api/admin/categories/:id/toggle', adminAuth, async (req, res) => {
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
router.put('/api/admin/categories/reorder', adminAuth, async (req, res) => {
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
router.get('/api/admin/subcategories', adminAuth, async (req, res) => {
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
router.get('/api/admin/subcategories/:id', adminAuth, async (req, res) => {
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
router.post('/api/admin/subcategories', adminAuth, async (req, res) => {
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
router.put('/api/admin/subcategories/:id', adminAuth, async (req, res) => {
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
router.delete('/api/admin/subcategories/:id', adminAuth, async (req, res) => {
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
router.patch('/api/admin/subcategories/:id/toggle', adminAuth, async (req, res) => {
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
router.put('/api/admin/subcategories/reorder', adminAuth, async (req, res) => {
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

export default router;

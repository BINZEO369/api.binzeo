// @ts-nocheck
import express from "express";
import { supabase, adminAuth, superAdminAuth } from "./admin-context";
const router = express.Router();

router.get('/api/admin/menu-items', adminAuth, async (req, res) => {
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
router.get('/api/admin/menu-items/tree', adminAuth, async (req, res) => {
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
router.get('/api/admin/menu-items/:id', adminAuth, async (req, res) => {
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
router.post('/api/admin/menu-items', adminAuth, async (req, res) => {
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
router.put('/api/admin/menu-items/:id', adminAuth, async (req, res) => {
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
router.delete('/api/admin/menu-items/:id', adminAuth, async (req, res) => {
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
router.patch('/api/admin/menu-items/:id/toggle', adminAuth, async (req, res) => {
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
router.put('/api/admin/menu-items/reorder', adminAuth, async (req, res) => {
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

export default router;

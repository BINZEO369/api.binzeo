// @ts-nocheck
import express from "express";
import { supabase, adminAuth, superAdminAuth } from "./admin-context";
const router = express.Router();

router.get('/api/admin/products', adminAuth, async (req, res) => {
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
router.get('/api/admin/products/all', adminAuth, async (req, res) => {
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
router.get('/api/admin/products/:id', adminAuth, async (req, res) => {
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
router.get('/api/admin/products/slug/:slug', adminAuth, async (req, res) => {
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
router.post('/api/admin/products', adminAuth, async (req, res) => {
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
router.put('/api/admin/products/:id', adminAuth, async (req, res) => {
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
router.delete('/api/admin/products/:id', adminAuth, async (req, res) => {
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
router.post('/api/admin/products/bulk-delete', adminAuth, async (req, res) => {
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
router.patch('/api/admin/products/:id/toggle-flag', adminAuth, async (req, res) => {
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
router.post('/api/admin/products/:id/duplicate', adminAuth, async (req, res) => {
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
router.get('/api/admin/products/:productId/videos', adminAuth, async (req, res) => {
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
router.get('/api/admin/product-videos/:id', adminAuth, async (req, res) => {
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
router.post('/api/admin/product-videos', adminAuth, async (req, res) => {
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
router.put('/api/admin/product-videos/:id', adminAuth, async (req, res) => {
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
router.delete('/api/admin/product-videos/:id', adminAuth, async (req, res) => {
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
router.patch('/api/admin/product-videos/:id/toggle', adminAuth, async (req, res) => {
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
router.get('/api/admin/products/:productId/banners', adminAuth, async (req, res) => {
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
router.get('/api/admin/product-banners/:id', adminAuth, async (req, res) => {
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
router.post('/api/admin/product-banners', adminAuth, async (req, res) => {
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
router.put('/api/admin/product-banners/:id', adminAuth, async (req, res) => {
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
router.delete('/api/admin/product-banners/:id', adminAuth, async (req, res) => {
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
router.patch('/api/admin/product-banners/:id/toggle', adminAuth, async (req, res) => {
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

router.get('/api/admin/products/stats', adminAuth, async (req, res) => {
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

export default router;

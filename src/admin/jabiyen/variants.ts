// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import express from "express";
import { supabase, adminAuth, superAdminAuth } from "./admin-context";
const router = express.Router();

router.get('/api/admin/products/:productId/colors', adminAuth, async (req, res) => {
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
router.get('/api/admin/product-colors/:id', adminAuth, async (req, res) => {
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
router.post('/api/admin/product-colors', adminAuth, async (req, res) => {
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
router.put('/api/admin/product-colors/:id', adminAuth, async (req, res) => {
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
router.delete('/api/admin/product-colors/:id', adminAuth, async (req, res) => {
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
router.get('/api/admin/product-colors/:colorId/sizes', adminAuth, async (req, res) => {
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
router.get('/api/admin/color-sizes/:id', adminAuth, async (req, res) => {
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
router.post('/api/admin/color-sizes', adminAuth, async (req, res) => {
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
router.put('/api/admin/color-sizes/:id', adminAuth, async (req, res) => {
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
router.delete('/api/admin/color-sizes/:id', adminAuth, async (req, res) => {
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
router.get('/api/admin/products/:productId/variants', adminAuth, async (req, res) => {
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
router.get('/api/admin/products/:productId/variants-matrix', adminAuth, async (req, res) => {
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
router.get('/api/admin/product-variants/:id', adminAuth, async (req, res) => {
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
router.post('/api/admin/product-variants', adminAuth, async (req, res) => {
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
router.post('/api/admin/product-variants/bulk', adminAuth, async (req, res) => {
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
router.post('/api/admin/products/:productId/generate-variants', adminAuth, async (req, res) => {
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
router.put('/api/admin/product-variants/:id', adminAuth, async (req, res) => {
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
router.put('/api/admin/product-variants/bulk', adminAuth, async (req, res) => {
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
router.delete('/api/admin/product-variants/:id', adminAuth, async (req, res) => {
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
router.post('/api/admin/product-variants/bulk-delete', adminAuth, async (req, res) => {
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
router.patch('/api/admin/product-variants/:id/toggle', adminAuth, async (req, res) => {
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
router.patch('/api/admin/product-variants/:id/stock', adminAuth, async (req, res) => {
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
router.get('/api/admin/products/:productId/variants-stats', adminAuth, async (req, res) => {
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
router.get('/api/admin/product-variants/search', adminAuth, async (req, res) => {
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
router.get('/api/admin/product-variants/sku/:sku', adminAuth, async (req, res) => {
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
router.get('/api/admin/product-variants/barcode/:barcode', adminAuth, async (req, res) => {
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


export default router;

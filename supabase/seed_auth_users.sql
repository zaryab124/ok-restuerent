-- Fix GoTrue Auth Users & Identities Schema for Supabase Cloud
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
DECLARE
    v_password_hash TEXT := crypt('okaykarubas12390', gen_salt('bf', 10));
    v_user RECORD;
    v_users JSONB := '[
        {"id": "10000000-0000-0000-0000-000000000001", "email": "owner1@okrestaurant.com", "name": "Muhammad Ibrahim (Owner 1)", "phone": "0333-4683344", "role": "OWNER"},
        {"id": "10000000-0000-0000-0000-000000000002", "email": "owner2@okrestaurant.com", "name": "Sheikh Farooq (Owner 2)", "phone": "0333-5551122", "role": "OWNER"},
        {"id": "10000000-0000-0000-0000-000000000003", "email": "owner3@okrestaurant.com", "name": "Malik Usman (Owner 3)", "phone": "0333-9994455", "role": "OWNER"},
        {"id": "20000000-0000-0000-0000-000000000002", "email": "admin.dera@okrestaurant.com", "name": "Tariq Admin (Dera Chungi)", "phone": "0334-4683344", "role": "BRANCH_ADMIN"},
        {"id": "20000000-0000-0000-0000-000000000003", "email": "admin.sherifalon@okrestaurant.com", "name": "Sajjad Admin (Sherifalon)", "phone": "0336-4683344", "role": "BRANCH_ADMIN"},
        {"id": "20000000-0000-0000-0000-000000000004", "email": "admin.kotchuta@okrestaurant.com", "name": "Rashid Admin (Kot Chuta)", "phone": "0333-2225757", "role": "BRANCH_ADMIN"},
        {"id": "30000000-0000-0000-0000-000000000001", "email": "kitchen.dera@okrestaurant.com", "name": "Chef Ahmad (Dera Kitchen)", "phone": "0300-1112233", "role": "KITCHEN"},
        {"id": "30000000-0000-0000-0000-000000000002", "email": "kitchen.sherifalon@okrestaurant.com", "name": "Chef Bilal (Sherifalon Kitchen)", "phone": "0300-4445566", "role": "KITCHEN"},
        {"id": "30000000-0000-0000-0000-000000000003", "email": "kitchen.kotchuta@okrestaurant.com", "name": "Chef Tariq (Kot Chuta Kitchen)", "phone": "0300-7778899", "role": "KITCHEN"},
        {"id": "40000000-0000-0000-0000-000000000001", "email": "rider1.dera@okrestaurant.com", "name": "Ali Rider (Dera Delivery)", "phone": "0301-9998877", "role": "RIDER"},
        {"id": "40000000-0000-0000-0000-000000000002", "email": "rider2.dera@okrestaurant.com", "name": "Hamza Rider (Dera Delivery)", "phone": "0301-3332211", "role": "RIDER"},
        {"id": "40000000-0000-0000-0000-000000000003", "email": "rider.sherifalon@okrestaurant.com", "name": "Zubair Rider (Sherifalon Delivery)", "phone": "0301-6665544", "role": "RIDER"},
        {"id": "40000000-0000-0000-0000-000000000004", "email": "rider.kotchuta@okrestaurant.com", "name": "Imran Rider (Kot Chuta Delivery)", "phone": "0301-8887766", "role": "RIDER"},
        {"id": "50000000-0000-0000-0000-000000000001", "email": "customer.demo@gmail.com", "name": "Usman Customer", "phone": "0321-5554433", "role": "CUSTOMER"}
    ]'::jsonb;
BEGIN
    FOR v_user IN SELECT * FROM jsonb_to_recordset(v_users) AS x(id UUID, email TEXT, name TEXT, phone TEXT, role TEXT)
    LOOP
        -- Clean existing invalid identity records for this user if any
        DELETE FROM auth.identities WHERE user_id = v_user.id OR provider_id = v_user.id::text OR provider_id = LOWER(v_user.email);

        -- Insert or Update into auth.users
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at
        ) VALUES (
            '00000000-0000-0000-0000-000000000000', v_user.id, 'authenticated', 'authenticated',
            LOWER(v_user.email), v_password_hash, NOW(),
            '{"provider": "email", "providers": ["email"]}'::jsonb,
            jsonb_build_object('full_name', v_user.name, 'phone', v_user.phone),
            NOW(), NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
            instance_id = '00000000-0000-0000-0000-000000000000',
            encrypted_password = v_password_hash,
            email_confirmed_at = NOW(),
            updated_at = NOW();

        -- Insert into auth.identities with provider_id = user_id::text
        INSERT INTO auth.identities (
            id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
        ) VALUES (
            v_user.id, v_user.id,
            jsonb_build_object('sub', v_user.id::text, 'email', LOWER(v_user.email)),
            'email', v_user.id::text, NOW(), NOW(), NOW()
        );

        -- Sync public.profiles
        INSERT INTO public.profiles (id, email, full_name, phone, role)
        VALUES (v_user.id, LOWER(v_user.email), v_user.name, v_user.phone, v_user.role)
        ON CONFLICT (id) DO UPDATE SET
            email = EXCLUDED.email, full_name = EXCLUDED.full_name,
            phone = EXCLUDED.phone, role = EXCLUDED.role;
    END LOOP;
END $$;
